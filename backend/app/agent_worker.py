import asyncio
import logging
import os
import json
import random
import uuid
import re
from datetime import datetime, timezone, timedelta
from sqlalchemy import select

from app.db.database import SessionLocal
from app.db import models
from app.db.schemas import ContactCreate
from app.crud import crud_prospect, crud_user, crud_config, crud_contact
from app.services.whatsapp_service import get_whatsapp_service, MessageSendError, WhatsAppService
from app.services.gemini_service import get_gemini_service
from app.services.google_drive_service import get_drive_service
from app.services.google_calendar_service import get_google_calendar_service
from googleapiclient.errors import HttpError
from app.api.prospecting import _synchronize_and_process_history

# Configuração do logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Dicionário para rastrear o último envio de cada campanha
# last_message_sent_times = {} # Agora será por instância no banco

async def process_active_prospects():
    """
    Busca campanhas de prospecção ativas e processa o próximo contato de cada uma,
    seja para uma resposta, follow-up ou mensagem inicial.
    """
    logger.info("AGENTE WORKER: Verificando campanhas ativas para processamento...")
    
    async with SessionLocal() as db:
        try:
            # 1. Busca todas as campanhas com status "Em Andamento"
            active_campaigns_list = await crud_prospect.get_active_campaigns(db)
            
            if not active_campaigns_list:
                logger.info("AGENTE WORKER: Nenhuma campanha ativa para processar no momento.")
                return
            
            logger.info(f"AGENTE WORKER: {len(active_campaigns_list)} campanhas ativas encontradas.")

            # Extrai IDs para evitar erros de "MissingGreenlet" em objetos expirados após rollback
            active_campaign_ids = [c.id for c in active_campaigns_list]

            whatsapp_service = get_whatsapp_service()
            gemini_service = get_gemini_service()
            drive_service = get_drive_service()

            # 2. Itera sobre cada campanha ativa
            for campaign_id in active_campaign_ids:
                try:
                    # Recarrega a campanha para garantir que está válida na sessão atual
                    campaign = await db.get(models.Prospect, campaign_id)
                    if not campaign: continue

                    user = await crud_user.get_user(db, user_id=campaign.user_id)
                    if not user:
                        logger.warning(f"Usuário {campaign.user_id} não encontrado para a campanha {campaign.id}. Pulando.")
                        continue

                    # 3. Encontra o próximo contato a ser processado para esta campanha
                    contact_to_process = await crud_prospect.get_prospects_para_processar(db, campaign)

                    if not contact_to_process:
                        logger.info(f"Nenhum contato para processar na campanha {campaign.id} no momento.")
                        continue
                    
                    pc, contact = contact_to_process
                    original_status = pc.situacao # Captura o status original antes de mudar para 'Processando'
                    
                    # Determina o modo de processamento, lidando com reprocessamento de erros
                    if pc.situacao == "Resposta Recebida":
                        mode = "reply"
                    elif pc.situacao == "Aguardando Início":
                        mode = "initial"
                    elif pc.situacao in ["Erro IA", "Falha no Envio", "Erro Verificação", "Erro: Persona não encontrada"]:
                        # Se deu erro, verifica o histórico para saber se era o início
                        try:
                            history = json.loads(pc.conversa) if pc.conversa else []
                        except:
                            history = []
                        # Se não tem mensagens da IA no histórico, era uma tentativa inicial
                        has_ai_msg = any(m.get('role') == 'assistant' for m in history)
                        mode = "initial" if not has_ai_msg else "reply"
                    else:
                        mode = "reply"
                    
                    logger.info(f"AGENTE WORKER: Contato selecionado: '{contact.nome}' (Campanha: {campaign.id}, Modo: {mode}).")
                    
                    selected_instance = None

                    # 4. Lógica de controle de tempo e horário (para 'initial' e 'followup')
                    if mode in ['initial', 'followup']:
                        if campaign.horario_inicio and campaign.horario_fim:
                            now_time = datetime.now().time()
                            if not (campaign.horario_inicio <= now_time <= campaign.horario_fim):
                                logger.info(f"Campanha {campaign.id} fora do horário de funcionamento. Pausando verificação para esta campanha.")
                                continue
                        
                        # Seleção de Instância e Controle de Intervalo
                        instance_ids = campaign.whatsapp_instance_ids or []
                        if not instance_ids:
                            logger.warning(f"Campanha {campaign.id} sem instâncias configuradas.")
                            continue

                        # Busca instâncias no banco
                        stmt = select(models.WhatsappInstance).where(models.WhatsappInstance.id.in_(instance_ids), models.WhatsappInstance.is_active == True)
                        instances_result = await db.execute(stmt)
                        available_instances = instances_result.scalars().all()

                        if not available_instances:
                            logger.warning(f"Nenhuma instância ativa encontrada para a campanha {campaign.id}.")
                            continue

                        # Encontra uma instância que respeite o intervalo
                        ready_instance = None
                        for inst in available_instances:
                            # 1. Verificar conexão primeiro
                            conn_status = await whatsapp_service.get_connection_status(inst.instance_name)
                            if conn_status.get("status") != "connected":
                                logger.warning(f"Instância '{inst.name}' (ID: {inst.id}) está desconectada. Inativando e pulando.")
                                inst.is_active = False
                                await db.commit()
                                continue # Tenta a próxima instância

                            # 2. Se conectada, verificar intervalo com Aleatorização Proporcional (Jitter)
                            last_sent = inst.last_message_at or datetime.min.replace(tzinfo=timezone.utc)
                            
                            # Pega o tempo base configurado no painel (padrão 60s)
                            intervalo_base = inst.interval_seconds or 60
                            
                            # Cria um multiplicador aleatório entre 0.7 (30% mais rápido) e 1.6 (60% mais lento)
                            # Ex: Se base é 60s, varia de 42s a 96s.
                            # Ex: Se base é 300s (5 min), varia de 3.5 min a 8 min.
                            fator_aleatorizacao = random.uniform(0.7, 1.6)
                            
                            # Aplica o fator ao tempo base
                            target_interval = int(intervalo_base * fator_aleatorizacao)
                            
                            # Trava de segurança: Nunca envia mensagens com menos de 15 segundos entre um lead e outro (evita ban)
                            target_interval = max(15, target_interval)

                            time_since_last = (datetime.now(timezone.utc) - last_sent).total_seconds()
                            
                            if time_since_last >= target_interval:
                                ready_instance = inst
                                break # Encontrou uma instância pronta
                            else:
                                logger.debug(f"Instância {inst.name} aguardando. Base: {intervalo_base}s | Alvo Aleatório: {target_interval}s | Faltam {target_interval - time_since_last:.1f}s")

                        if not ready_instance:
                            logger.info(f"Todas as instâncias da campanha {campaign.id} estão em intervalo ou desconectadas. Aguardando...")
                            continue
                        
                        selected_instance = ready_instance
                    
                    elif mode == 'reply':
                        # Para respostas, usa a instância associada ao contato
                        if not pc.whatsapp_instance_id:
                            logger.error(f"Contato {pc.id} em modo 'reply' não tem instância associada. Tratando possível duplicidade.")
                            
                            clean_whatsapp = "".join(filter(str.isdigit, str(contact.whatsapp)))
                            if len(clean_whatsapp) >= 8:
                                last_8_digits = clean_whatsapp[-8:]
                                logger.info(f"AGENTE WORKER: Buscando contato duplicado com final {last_8_digits} na campanha {campaign.id}...")
                                
                                stmt = (
                                    select(models.ProspectContact, models.Contact)
                                    .join(models.Contact, models.ProspectContact.contact_id == models.Contact.id)
                                    .where(
                                        models.ProspectContact.prospect_id == campaign.id,
                                        models.ProspectContact.id != pc.id
                                    )
                                )
                                result = await db.execute(stmt)
                                other_contacts = result.all()
                                
                                for other_pc, other_c in other_contacts:
                                    other_clean = "".join(filter(str.isdigit, str(other_c.whatsapp)))
                                    if other_clean.endswith(last_8_digits):
                                        logger.info(f"AGENTE WORKER: Contato duplicado encontrado (ID: {other_pc.id}). Atualizando status e removendo o atual (ID: {pc.id}).")
                                        await crud_prospect.update_prospect_contact_status(db, other_pc.id, "Resposta Recebida")
                                        await crud_prospect.delete_prospect_contact(db, prospect_contact_to_delete=pc)
                                        await db.commit()
                                        break
                            continue
                        
                        selected_instance = await db.get(models.WhatsappInstance, pc.whatsapp_instance_id)
                        
                        # Se não houver instância associada, não podemos responder.
                        if not selected_instance:
                            logger.error(f"Instância {pc.whatsapp_instance_id} associada ao contato {pc.id} não foi encontrada no banco. Pulando.")
                            continue

                        # NOVA LÓGICA: Verificar conexão da instância
                        conn_status = await whatsapp_service.get_connection_status(selected_instance.instance_name)
                        if conn_status.get("status") != "connected":
                            logger.warning(f"Instância '{selected_instance.name}' (ID: {selected_instance.id}) para resposta está desconectada. Contato {pc.id} aguardará reconexão.")
                            # Não processa este contato, ele será pego na próxima rodada quando a instância voltar.
                            continue
                    
                    # 5. Processamento do contato
                    await crud_prospect.update_prospect_contact_status(db, pc_id=pc.id, situacao="Processando")
                    await db.commit()
                    
                    # Atualiza o objeto pc com os dados mais recentes do banco
                    await db.refresh(pc)
                    
                    # Associa a instância ao contato se ainda não estiver (para 'initial')
                    if mode == 'initial' and selected_instance:
                        pc.whatsapp_instance_id = selected_instance.id
                        await db.commit()

                    # --- VERIFICAÇÃO DE NÚMERO (NOVO) ---
                    if mode == 'initial':
                        logger.info(f"AGENTE WORKER: Verificando existência do número {contact.whatsapp} no WhatsApp...")
                        check_result = await whatsapp_service.check_whatsapp_numbers(selected_instance.instance_name, [contact.whatsapp])
                        
                        if check_result is None:
                            logger.error(f"AGENTE WORKER: Erro técnico ao verificar número {contact.whatsapp} na campanha {campaign.id}.")
                            await crud_prospect.update_prospect_contact(
                                db, pc_id=pc.id, situacao="Erro Verificação", 
                                observacoes="Falha na comunicação com a API de verificação."
                            )
                            await db.commit()
                            continue
                        
                        if not isinstance(check_result, list) or len(check_result) == 0:
                            logger.error(f"AGENTE WORKER: Resposta inválida da verificação para {contact.whatsapp} na campanha {campaign.id}: {check_result}")
                            await crud_prospect.update_prospect_contact(
                                db, pc_id=pc.id, situacao="Erro Verificação", 
                                observacoes=f"Resposta inesperada da API: {check_result}"
                            )
                            await db.commit()
                            continue

                        number_status = check_result[0]
                        if not number_status.get("exists"):
                            logger.info(f"AGENTE WORKER: Número {contact.whatsapp} não existe no WhatsApp.")
                            await crud_prospect.update_prospect_contact(
                                db, pc_id=pc.id, situacao="Sem WhatsApp", 
                                observacoes="Número verificado e identificado como inválido/inexistente."
                            )
                            await db.commit()
                            continue
                    # -------------------------------------

                    persona_config = await crud_config.get_config(db, config_id=campaign.config_id, user_id=user.id)
                    if not persona_config:
                        logger.error(f"Persona não encontrada para a campanha {campaign.id}. Pulando contato.")
                        await crud_prospect.update_prospect_contact(db, pc_id=pc.id, situacao="Erro: Persona não encontrada", observacoes="A configuração de IA associada não foi encontrada.")
                        await db.commit()
                        continue

                    full_history = await _synchronize_and_process_history(
                        db=db, 
                        prospect_contact=pc, 
                        user=user, 
                        persona_config=persona_config, 
                        whatsapp_service=whatsapp_service, 
                        gemini_service=gemini_service, 
                        mode=mode,
                        whatsapp_instance=selected_instance
                    )

                    # --- SISTEMA ANTI-RAJADA (Esperar o lead terminar o raciocínio) ---
                    if mode == 'reply' and full_history:
                        # Filtra apenas as mensagens enviadas pelo lead
                        user_messages = [msg for msg in full_history if msg.get('role') == 'user']
                        
                        if user_messages:
                            last_user_msg = user_messages[-1]
                            last_user_msg_time_str = last_user_msg.get('timestamp')
                            
                            if last_user_msg_time_str:
                                try:
                                    last_msg_time = datetime.fromisoformat(last_user_msg_time_str.replace('Z', '+00:00'))
                                    seconds_since_last_msg = (datetime.now(timezone.utc) - last_msg_time).total_seconds()
                                    
                                    # Conta quantas mensagens o lead enviou nos últimos 60 segundos (para identificar a rajada)
                                    msgs_last_minute = 0
                                    for m in reversed(user_messages):
                                        m_time_str = m.get('timestamp')
                                        if not m_time_str: continue
                                        m_time = datetime.fromisoformat(m_time_str.replace('Z', '+00:00'))
                                        if (datetime.now(timezone.utc) - m_time).total_seconds() < 60:
                                            msgs_last_minute += 1
                                        else:
                                            break # Como está em ordem reversa, se passou de 60s pode parar de checar
                                            
                                    # Tempo de carência dinâmico: 
                                    # Base de 8 segundos + 4 segundos extras para cada mensagem na rajada
                                    carencia_rajada = 8.0 + (msgs_last_minute * 4.0)
                                    
                                    # Limite máximo de espera (para não travar o bot para sempre se o cara for um maníaco do WhatsApp)
                                    carencia_rajada = min(carencia_rajada, 30.0)
                                    
                                    if seconds_since_last_msg < carencia_rajada:
                                        logger.info(
                                            f"AGENTE WORKER: Lead {contact.whatsapp} em modo RAJADA "
                                            f"({msgs_last_minute} msgs). Última foi há {seconds_since_last_msg:.1f}s. "
                                            f"Aguardando a poeira baixar (Carência: {carencia_rajada}s)."
                                        )
                                        
                                        # Devolve o status para "Aguardando Resposta" para ser pego no próximo ciclo do Worker
                                        await crud_prospect.update_prospect_contact(db, pc_id=pc.id, situacao="Aguardando Resposta")
                                        continue # Pula este contato e vai pro próximo da fila
                                except Exception as e:
                                    logger.warning(f"Erro ao calcular Sistema Anti-Rajada: {e}")

                    # --- FIM DO SISTEMA ANTI-RAJADA ---
                    # --- 4. TEMPO DE LEITURA PROPORCIONAL ---
                    if mode == 'reply' and full_history and full_history[-1]['role'] == 'user':
                        tamanho_mensagem_cliente = len(str(full_history[-1].get('content', '')))
                        
                        # Um humano lê em média 15 a 20 caracteres por segundo (com calma no WhatsApp).
                        # Se a mensagem tiver 100 caracteres, demora uns 5 segundos só processando.
                        tempo_digestao_texto = tamanho_mensagem_cliente / 20.0
                        
                        # Trava máxima para o bot não travar o worker se o cliente mandar um livro
                        tempo_digestao_texto = min(tempo_digestao_texto, 15.0) 
                        
                        if tempo_digestao_texto > 2.0:
                            logger.info(f"AGENTE WORKER: Cliente mandou mensagem longa ({tamanho_mensagem_cliente} chars). Simulando {tempo_digestao_texto:.1f}s de tempo de leitura profundo...")
                            await asyncio.sleep(tempo_digestao_texto)

                    # --- 1. TEMPO DE ESCUTA REAL (Para áudios) ---
                    if mode == 'reply' and full_history and full_history[-1]['role'] == 'user' and full_history[-1].get('type') == 'audio':
                        # Pega o tamanho do texto transcrito para estimar o tempo
                        texto_transcrito = full_history[-1].get('content', '')
                        
                        # Um humano fala em média 2.5 palavras por segundo.
                        qtd_palavras = len(texto_transcrito.split())
                        tempo_escuta_estimado = max(5.0, qtd_palavras / 2.5)
                        
                        logger.info(f"AGENTE WORKER: Cliente mandou áudio. Simulando {tempo_escuta_estimado:.1f}s de escuta...")
                        
                        # Fica online, mas não faz nada enquanto "ouve"
                        await whatsapp_service.send_presence(selected_instance.instance_name, contact.whatsapp, "available")
                        await asyncio.sleep(tempo_escuta_estimado)

                    if mode == 'reply' and (not full_history or full_history[-1]['role'] != 'user'):
                        logger.warning(f"AGENTE WORKER: Contato {pc.id} em modo 'reply' mas a última mensagem não é do usuário. Ignorando e voltando para 'Aguardando Resposta'.")
                        await crud_prospect.update_prospect_contact(db, pc_id=pc.id, situacao="Aguardando Resposta")
                        continue
                    
                    ia_response = await gemini_service.generate_conversation_action(
                        config=persona_config, contact=contact, conversation_history_db=full_history,
                        mode=mode, db=db, user=user
                    )

                    message_to_send = ia_response.get("mensagem_para_enviar")
                    new_status = ia_response.get("nova_situacao", "Aguardando Resposta")
                    new_observation = ia_response.get("observacoes", "")
                    lead_score = ia_response.get("lead_score", 0)
                    files_to_send = ia_response.get("arquivos_anexos", [])
                    novos_contatos = ia_response.get("novos_contatos", [])
                    ia_tokens_used = ia_response.get("token_usage", 0)
                    acao_agenda = ia_response.get("acao_agenda")
                    data_agendamento = ia_response.get("data_agendamento")
                    email_cliente = ia_response.get("email_cliente")
                    new_notification_id = None
                    
                    emoji_reaction = ia_response.get("reagir_com_emoji")
                    
                    if emoji_reaction and full_history and full_history[-1]['role'] == 'user':
                        last_msg_id = full_history[-1].get('id')
                        if last_msg_id:
                            await whatsapp_service.send_reaction(
                                selected_instance.instance_name, 
                                contact.whatsapp, 
                                last_msg_id, 
                                emoji_reaction
                            )
                            logger.info(f"AGENTE WORKER: Reagiu com {emoji_reaction} na mensagem {last_msg_id}")
                            sent_any_message = True
                    
                    history_after_response = full_history.copy()
                    sent_any_message = False
                    
                    # --- NOTIFICAÇÃO DE STATUS ---
                    notification_statuses = ["lead qualificado", "atendente chamado"]
                    if (persona_config.notification_active and persona_config.notification_destination
                            and new_status and str(new_status).strip().lower() in notification_statuses):
                        # Usa original_status pois pc.situacao agora é 'Processando'
                        if original_status and str(original_status).strip().lower() != str(new_status).strip().lower():
                            # Usa a instância atual selecionada para enviar a notificação
                            notify_instance_name = selected_instance.instance_name

                            notify_destination = str(persona_config.notification_destination).strip()
                            if notify_destination:
                                if "@" not in notify_destination:
                                    notify_destination = f"{whatsapp_service._normalize_number(notify_destination)}@s.whatsapp.net"
                                else:
                                    parts = notify_destination.split("@")
                                    notify_destination = f"{parts[0].strip()}@{parts[1].strip()}"

                            if pc.last_notification_message_id and notify_destination:
                                logger.info(f"Apagando notificação antiga {pc.last_notification_message_id} para {notify_destination}")
                                await whatsapp_service.delete_message_for_everyone(notify_instance_name, notify_destination, pc.last_notification_message_id)

                            try:
                                notify_msg = (
                                    f"📢 *Atualização de Prospecção*\n\n"
                                    f"📋 *Campanha:* {campaign.nome_prospeccao}\n"
                                    f"👤 *Contato:* {contact.nome}\n"
                                    f"📱 *WhatsApp:* {contact.whatsapp}\n"
                                    f"🏷️ *Novo Status:* {new_status}\n"
                                    f"📝 *Obs:* {new_observation or 'Sem observações'}\n"
                                    f"⭐ *Score:* {lead_score}"
                                )
                                sent_notification = await whatsapp_service.send_text_message(notify_instance_name, notify_destination, notify_msg)
                                if sent_notification and 'key' in sent_notification:
                                    new_notification_id = sent_notification['key'].get('id')

                            except Exception as e:
                                logger.error(f"AGENTE WORKER: Falha ao enviar notificação para {persona_config.notification_destination}: {e}")

                    if message_to_send:
                        try:
                            # --- 1. ABRINDO O CHAT (Marcando como lido de forma humana) ---
                            # Pega as mensagens do usuário para marcar como lidas agora
                            user_msg_ids = [
                                msg['id'] for msg in full_history 
                                if msg.get('role') == 'user' and 'id' in msg and not str(msg['id']).startswith(('sent_', 'internal_'))
                            ]
                            
                            if user_msg_ids:
                                target_jid = f"{whatsapp_service._normalize_number(contact.whatsapp)}@s.whatsapp.net"
                                
                                # Simula o tempo do humano pegando o celular na mão e abrindo o app ANTES de ficar azul
                                tempo_pegar_celular = random.uniform(2.0, 8.0)
                                await asyncio.sleep(tempo_pegar_celular)
                                
                                # AQUI a mensagem fica azul para o cliente
                                await whatsapp_service.mark_messages_as_read(selected_instance.instance_name, target_jid, user_msg_ids)
                                logger.info(f"AGENTE WORKER: Mensagens de {contact.whatsapp} marcadas como lidas. Iniciando leitura/digitação...")
                                
                                # Simula o humano lendo a mensagem que acabou de abrir
                                tempo_leitura = random.uniform(1.5, 4.0)
                                await asyncio.sleep(tempo_leitura)

                            # 1. Normaliza para Lista (caso a IA erre e mande string)
                            if isinstance(message_to_send, str):
                                messages_parts = [p.strip() for p in message_to_send.replace('\\n', '\n').split('\n') if p.strip()]
                            elif isinstance(message_to_send, list):
                                messages_parts = [str(p).strip() for p in message_to_send if str(p).strip()]
                            else:
                                messages_parts = []

                            for i, part in enumerate(messages_parts):
                                # Verifica se a IA gerou uma mensagem "âncora" de consulta
                                frases_de_espera = ["minutinho", "peraí", "espera", "olhar aqui", "confirmar aqui", "rapidão", "sistema"]
                                is_mensagem_espera = i == 0 and any(f in part.lower() for f in frases_de_espera) and len(messages_parts) > 1

                                hesitation = random.uniform(0.5, 1.8)
                                chars_per_sec = random.uniform(4.0, 7.0)
                                typing_delay = hesitation + (len(part) / chars_per_sec)
                                
                                # Digita e envia a mensagem âncora ("peraí que vou olhar")
                                await whatsapp_service.send_presence(selected_instance.instance_name, contact.whatsapp, "composing", delay=int(typing_delay * 1000))
                                await asyncio.sleep(typing_delay)
                                await whatsapp_service.send_text_message(selected_instance.instance_name, contact.whatsapp, part)
                                logger.info(f"AGENTE WORKER: Parte {i+1}/{len(messages_parts)} da mensagem enviada para {contact.whatsapp}.")

                                now_iso = datetime.now(timezone.utc).isoformat()
                                pending_id = f"sent_{now_iso}_{random.randint(1000, 9999)}"
                                history_after_response.append({"id": pending_id, "role": "assistant", "content": part, "timestamp": now_iso})
                                sent_any_message = True

                                # SE FOI UMA MENSAGEM DE ESPERA, O BOT DESAPARECE PARA "PROCURAR"
                                if is_mensagem_espera:
                                    tempo_procurando = random.uniform(15.0, 40.0)
                                    logger.info(f"AGENTE WORKER: Simulando consulta em sistema por {tempo_procurando:.1f}s...")
                                    # Fica apenas 'available' (online), sem digitar
                                    await whatsapp_service.send_presence(selected_instance.instance_name, contact.whatsapp, "available")
                                    await asyncio.sleep(tempo_procurando)
                                else:
                                    # Pausa normal entre mensagens comuns
                                    if i < len(messages_parts) - 1:
                                        await asyncio.sleep(random.uniform(0.8, 2.0))

                        except MessageSendError as e:
                            logger.error(f"AGENTE WORKER: Falha ao enviar mensagem para {contact.whatsapp}. Erro: {e}")
                            new_status = "Falha no Envio"
                            new_observation = f"Falha no envio via WhatsApp: {e}"
                    
                    # Processamento de Arquivos
                    if files_to_send and isinstance(files_to_send, list):
                        for file_id in files_to_send:
                            try:
                                logger.info(f"AGENTE WORKER: Baixando arquivo {file_id} para envio...")
                                file_data = await drive_service.download_file(file_id)
                                if file_data:
                                    mime = file_data['mime_type']
                                    if 'image' in mime: media_type = 'image'
                                    elif 'video' in mime: media_type = 'video'
                                    else: media_type = 'document'

                                    await whatsapp_service.send_media_message(
                                        instance_name=selected_instance.instance_name,
                                        number=contact.whatsapp,
                                        media=file_data['base64'],
                                        media_type=media_type,
                                        mime_type=mime,
                                        file_name=file_data['file_name']
                                    )
                                    logger.info(f"AGENTE WORKER: Arquivo {file_data['file_name']} enviado com sucesso.")
                                    
                                    now_iso = datetime.now(timezone.utc).isoformat()
                                    pending_id = f"sent_file_{now_iso}"
                                    history_after_response.append({"id": pending_id, "role": "assistant", "content": f"[Arquivo enviado: {file_data['file_name']}]", "timestamp": now_iso})
                                    sent_any_message = True
                            except Exception as e:
                                logger.error(f"AGENTE WORKER: Falha ao enviar arquivo {file_id}: {e}")

                    # --- PROCESSAMENTO DE NOVOS CONTATOS INDICADOS PELA IA ---
                    if novos_contatos and isinstance(novos_contatos, list):
                        for nc in novos_contatos:
                            try:
                                nc_nome = nc.get("nome")
                                nc_numero = nc.get("numero")
                                nc_obs = nc.get("observacao")

                                if nc_nome and nc_numero:
                                    # Limpeza básica do número
                                    clean_number = "".join(filter(str.isdigit, str(nc_numero)))
                                    
                                    # Verifica se o contato já existe
                                    existing_contact = await crud_contact.get_contact_by_whatsapp(db, clean_number, user.id)
                                    
                                    contact_id = None
                                    if existing_contact:
                                        contact_id = existing_contact.id
                                        logger.info(f"AGENTE WORKER: Contato existente encontrado para indicação: {existing_contact.nome}")
                                    else:
                                        # Cria o contato
                                        new_contact_in = ContactCreate(
                                            nome=nc_nome,
                                            whatsapp=clean_number,
                                            observacoes=nc_obs,
                                            categoria=["Indicado pela IA"]
                                        )
                                        created_contact = await crud_contact.create_contact(db, new_contact_in, user.id)
                                        contact_id = created_contact.id
                                        logger.info(f"AGENTE WORKER: Novo contato criado pela IA: {nc_nome}")
                                    
                                    # Adiciona à campanha atual se tivermos um ID válido
                                    if contact_id:
                                        # Verifica se já está na campanha para evitar duplicidade
                                        stmt = select(models.ProspectContact).where(
                                            models.ProspectContact.prospect_id == campaign.id,
                                            models.ProspectContact.contact_id == contact_id
                                        )
                                        result = await db.execute(stmt)
                                        existing_association = result.scalars().first()

                                        if not existing_association:
                                            new_association = models.ProspectContact(
                                                prospect_id=campaign.id,
                                                contact_id=contact_id,
                                                situacao="Aguardando Início",
                                                observacoes=f"Indicado por {contact.nome}. Contexto: {nc_obs}"
                                            )
                                            db.add(new_association)
                                            await db.commit()
                                            logger.info(f"AGENTE WORKER: Contato {nc_nome} adicionado à campanha {campaign.id}.")
                            except Exception as e:
                                logger.error(f"AGENTE WORKER: Erro ao processar novo contato da IA: {e}", exc_info=True)

                    # --- PROCESSAMENTO DE AGENDAMENTO ---
                    if acao_agenda == "agendar_reuniao" and data_agendamento:
                        try:
                            logger.info(f"AGENTE WORKER: Agendando reunião para {data_agendamento} com {contact.nome}...")
                            
                            if not persona_config.google_calendar_credentials:
                                raise Exception("Credenciais do Google Calendar não configuradas.")

                            calendar_service = get_google_calendar_service(persona_config)
                            service = calendar_service.get_service()

                            dt_start = datetime.fromisoformat(data_agendamento)
                            
                            # --- Verificação de Agendamentos Existentes ---
                            loop = asyncio.get_running_loop()
                            now_utc = datetime.now(timezone.utc).isoformat()
                            
                            # Busca eventos futuros com o nome do contato
                            existing_events_result = await loop.run_in_executor(
                                None,
                                lambda: service.events().list(
                                    calendarId='primary',
                                    timeMin=now_utc,
                                    q=contact.nome,
                                    singleEvents=True,
                                    orderBy='startTime'
                                ).execute()
                            )
                            existing_events = existing_events_result.get('items', [])
                            
                            already_scheduled = False
                            
                            for event in existing_events:
                                if 'dateTime' not in event.get('start', {}):
                                    continue
                                
                                event_start_str = event['start']['dateTime']
                                try:
                                    event_start = datetime.fromisoformat(event_start_str)
                                    
                                    # Normaliza para comparação (remove timezone se necessário)
                                    if dt_start.tzinfo is None:
                                        event_start_compare = event_start.replace(tzinfo=None)
                                        dt_start_compare = dt_start
                                    else:
                                        event_start_compare = event_start
                                        dt_start_compare = dt_start
                                    
                                    # Verifica se é o mesmo horário (tolerância de 1 minuto)
                                    if abs((event_start_compare - dt_start_compare).total_seconds()) < 60:
                                        already_scheduled = True
                                        logger.info(f"AGENTE WORKER: Reunião já existe para {contact.nome} em {event_start_str}. Mantendo.")
                                    else:
                                        # Horário diferente: Deleta o evento antigo (reagendamento)
                                        logger.info(f"AGENTE WORKER: Removendo agendamento antigo de {contact.nome} em {event_start_str}.")
                                        await loop.run_in_executor(
                                            None,
                                            lambda e_id=event['id']: service.events().delete(calendarId='primary', eventId=e_id).execute()
                                        )
                                except ValueError:
                                    continue

                            if already_scheduled:
                                new_observation += " [Reunião já agendada]"
                            else:
                                dt_end = dt_start + timedelta(hours=1)

                                event_body = {
                                    'summary': f'Reunião com {contact.nome}',
                                    'description': f'Agendado via ProspectAI.\nContato: {contact.nome}\nWhatsApp: {contact.whatsapp}\nObs: {new_observation}',
                                    'start': {'dateTime': dt_start.isoformat(), 'timeZone': 'America/Sao_Paulo'},
                                    'end': {'dateTime': dt_end.isoformat(), 'timeZone': 'America/Sao_Paulo'},
                                    'conferenceData': {
                                        'createRequest': {
                                            'requestId': f"{uuid.uuid4()}",
                                        }
                                    }
                                }

                                if email_cliente and isinstance(email_cliente, str):
                                    clean_email = email_cliente.strip()
                                    if re.match(r"[^@]+@[^@]+\.[^@]+", clean_email):
                                        event_body['attendees'] = [{'email': clean_email}]

                                try:
                                    event = await loop.run_in_executor(
                                        None,
                                        lambda: service.events().insert(calendarId='primary', body=event_body, conferenceDataVersion=1, sendUpdates='all').execute()
                                    )
                                    meeting_link = event.get('hangoutLink')
                                    if meeting_link:
                                        new_observation += f" [Reunião agendada: {meeting_link}]"
                                    else:
                                        new_observation += f" [Reunião agendada]"
                                except Exception as req_err:
                                    logger.warning(f"AGENTE WORKER: Falha ao criar evento com Meet, tentando sem. Erro: {req_err}")
                                    if 'conferenceData' in event_body:
                                        del event_body['conferenceData']
                                    event = await loop.run_in_executor(
                                        None,
                                        lambda: service.events().insert(calendarId='primary', body=event_body, sendUpdates='all').execute()
                                    )
                                    new_observation += f" [Reunião agendada (Sem Meet)]"

                        except HttpError as e:
                            logger.error(f"AGENTE WORKER: Erro HTTP do Google Calendar: {e}")
                            error_message = f"Erro da API do Google ({e.resp.status})"
                            try:
                                error_content = json.loads(e.content)
                                errors = error_content.get('error', {}).get('errors', [])
                                if errors and errors[0].get('reason') == 'accessNotConfigured':
                                    error_message = "Falha no agendamento: A API do Google Calendar não está ativada. Por favor, ative-a no Google Cloud Console."
                                elif errors:
                                    error_message = f"Falha no agendamento: {errors[0].get('message', e.reason)}"
                                else:
                                    error_message = f"Falha no agendamento: {e.reason}"
                            except (json.JSONDecodeError, IndexError, KeyError):
                                error_message = f"Falha no agendamento: {e.reason or 'Erro desconhecido na API do Google.'}"
                            new_observation += f" [{error_message}]"
                        except Exception as e:
                            logger.error(f"AGENTE WORKER: Erro ao agendar reunião: {e}")
                            new_observation += f" [Falha no agendamento: {str(e)}]"

                    if not sent_any_message:
                        logger.info(f"AGENTE WORKER: IA decidiu não enviar mensagem para {contact.whatsapp} (Modo: {mode}).")
                        now_iso = datetime.now(timezone.utc).isoformat()
                        pending_id = f"internal_{now_iso}"
                        history_after_response.append({"id": pending_id, "role": "assistant", "content": f"[Ação Interna: Não responder - Modo: {mode}]", "timestamp": now_iso})
                    elif mode in ['initial', 'followup']:
                        # Atualiza o cooldown da instância
                        selected_instance.last_message_at = datetime.now(timezone.utc)
                        await db.commit()

                    await crud_prospect.update_prospect_contact(
                        db, pc_id=pc.id, situacao=new_status,
                        conversa=json.dumps(history_after_response), 
                        observacoes=new_observation,
                        tokens_to_add=ia_tokens_used,
                        lead_score=lead_score,
                        last_notification_message_id=new_notification_id
                    )
                    # O commit já é feito dentro do crud_prospect.update_prospect_contact

                except Exception as e:
                    logger.error(f"AGENTE WORKER: Erro ao processar campanha ID {campaign_id}: {e}", exc_info=True)
                    await db.rollback()

                    # Tenta marcar o contato específico com erro, se possível
                    if 'pc' in locals():
                        await crud_prospect.update_prospect_contact(db, pc_id=pc.id, situacao="Erro IA", observacoes=f"Erro no worker: {e}")
                        await db.commit()

        except Exception as e:
            logger.error(f"AGENTE WORKER: Erro crítico no ciclo principal: {e}", exc_info=True)
            await db.rollback()

async def main():
    """Função principal que executa o worker em um loop infinito."""
    logger.info("🚀 AGENTE WORKER INICIADO 🚀")
    check_interval = int(os.getenv("AGENT_WORKER_INTERVAL", "10"))
    
    while True:
        await process_active_prospects()
        logger.info(f"AGENTE WORKER: Aguardando {check_interval} segundos para a próxima verificação...")
        await asyncio.sleep(check_interval)

if __name__ == "__main__":
    # Garante que o loop de eventos asyncio seja executado
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("AGENTE WORKER: Desligamento solicitado. Encerrando.")