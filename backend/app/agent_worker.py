import asyncio
import logging
import os
import json
import random
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
                    mode = "reply" if pc.situacao == "Resposta Recebida" else ("initial" if pc.situacao == "Aguardando Início" else "followup")
                    
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
                            last_sent = inst.last_message_at or datetime.min.replace(tzinfo=timezone.utc)
                            interval = inst.interval_seconds or 60
                            time_since_last = (datetime.now(timezone.utc) - last_sent).total_seconds()
                            
                            if time_since_last >= interval:
                                ready_instance = inst
                                break
                            else:
                                logger.debug(f"Instância {inst.name} em cooldown. Faltam {interval - time_since_last:.1f}s")

                        if not ready_instance:
                            logger.info(f"Todas as instâncias da campanha {campaign.id} estão em intervalo. Aguardando...")
                            continue
                        
                        selected_instance = ready_instance
                    
                    elif mode == 'reply':
                        # Para respostas, usa a instância associada ao contato ou a primeira disponível
                        if pc.whatsapp_instance_id:
                            selected_instance = await db.get(models.WhatsappInstance, pc.whatsapp_instance_id)
                        
                        if not selected_instance:
                             # Fallback: pega a primeira instância ativa da campanha
                             instance_ids = campaign.whatsapp_instance_ids or []
                             if instance_ids:
                                 stmt = select(models.WhatsappInstance).where(models.WhatsappInstance.id == instance_ids[0])
                                 result = await db.execute(stmt)
                                 selected_instance = result.scalars().first()
                        
                        if not selected_instance:
                            logger.error(f"Não foi possível determinar a instância para responder ao contato {contact.id}.")
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
                            logger.error(f"AGENTE WORKER: Erro técnico ao verificar número {contact.whatsapp}. Pausando campanha {campaign.id}.")
                            campaign.status = "Pausado"
                            await crud_prospect.update_prospect_contact(
                                db, pc_id=pc.id, situacao="Erro Verificação", 
                                observacoes="Falha na comunicação com a API de verificação."
                            )
                            await db.commit()
                            continue
                        
                        if not isinstance(check_result, list) or len(check_result) == 0:
                            logger.error(f"AGENTE WORKER: Resposta inválida da verificação para {contact.whatsapp}: {check_result}")
                            campaign.status = "Pausado"
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
                        logger.error(f"Persona não encontrada para a campanha {campaign.id}. Pausando prospecção.")
                        campaign.status = "Pausado"
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

                    # --- MARCAR COMO LIDO (NOVO) ---
                    try:
                        # Filtra apenas mensagens que vieram do contato (role='user') e que possuem ID real (não temporário)
                        user_msg_ids = [
                            msg['id'] for msg in full_history 
                            if msg.get('role') == 'user' and 'id' in msg and not str(msg['id']).startswith(('sent_', 'internal_'))
                        ]
                        
                        if user_msg_ids:
                            # Tenta obter o JID correto (priorizando o que está salvo no contato)
                            target_jid = None
                            if pc.jid_options:
                                jids = [j.strip() for j in pc.jid_options.split(',') if j.strip()]
                                if jids: target_jid = jids[0]
                            
                            if not target_jid:
                                target_jid = f"{whatsapp_service._normalize_number(contact.whatsapp)}@s.whatsapp.net"
                            
                            await whatsapp_service.mark_messages_as_read(selected_instance.instance_name, target_jid, user_msg_ids)
                    except Exception as e:
                        logger.warning(f"Erro ao tentar marcar mensagens como lidas para {contact.nome}: {e}")

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
                    new_notification_id = None
                    
                    history_after_response = full_history.copy()
                    sent_any_message = False
                    
                    # --- NOTIFICAÇÃO DE STATUS ---
                    if campaign.notification_number and new_status in ["Lead Qualificado", "Atendente Chamado"]:
                        # Usa original_status pois pc.situacao agora é 'Processando'
                        if original_status != new_status:
                            # Determina qual instância enviará a notificação
                            notify_instance_name = selected_instance.instance_name
                            if campaign.notification_instance_id:
                                # Busca a instância específica configurada para notificações
                                notify_inst_obj = await db.get(models.WhatsappInstance, campaign.notification_instance_id)
                                if notify_inst_obj:
                                    notify_instance_name = notify_inst_obj.instance_name

                            # Tenta apagar a notificação anterior se existir
                            if pc.last_notification_message_id:
                                logger.info(f"Apagando notificação antiga {pc.last_notification_message_id} para {campaign.notification_number}")
                                await whatsapp_service.delete_message_for_everyone(notify_instance_name, campaign.notification_number, pc.last_notification_message_id)

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
                                sent_notification = await whatsapp_service.send_text_message(notify_instance_name, campaign.notification_number, notify_msg)
                                if sent_notification and 'key' in sent_notification:
                                    new_notification_id = sent_notification['key'].get('id')

                            except Exception as e:
                                logger.error(f"AGENTE WORKER: Falha ao enviar notificação para {campaign.notification_number}: {e}")

                    if message_to_send and str(message_to_send).strip():
                        try:
                            # Divide a mensagem por quebras de linha para enviar separadamente
                            # CORREÇÃO: Garante que quebras de linha que a IA possa ter escapado (ex: "\\n")
                            # sejam convertidas para quebras de linha reais (\n) antes de dividir.
                            processed_message = str(message_to_send).replace('\\n', '\n')
                            messages_parts = [p.strip() for p in processed_message.split('\n') if p.strip()]
                            
                            for part in messages_parts:
                                # Simula tempo de digitação: 1.5s base + 0.05s por caractere (Max 7s)
                                typing_delay = min(2 + (len(part) * 0.1), 10.0)
                                
                                # Envia status "Digitando..." (composing)
                                await whatsapp_service.send_presence(selected_instance.instance_name, contact.whatsapp, "composing", delay=int(typing_delay * 1000))
                                await asyncio.sleep(typing_delay)

                                await whatsapp_service.send_text_message(selected_instance.instance_name, contact.whatsapp, part)
                                logger.info(f"AGENTE WORKER: Parte da mensagem enviada para {contact.whatsapp}.")
                                now_iso = datetime.now(timezone.utc).isoformat()
                                pending_id = f"sent_{now_iso}_{random.randint(1000, 9999)}"
                                history_after_response.append({"id": pending_id, "role": "assistant", "content": part, "timestamp": now_iso})

                            sent_any_message = True

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
                            dt_end = dt_start + timedelta(hours=1)

                            event_body = {
                                'summary': f'Reunião com {contact.nome}',
                                'description': f'Agendado via ProspectAI.\nContato: {contact.nome}\nWhatsApp: {contact.whatsapp}\nObs: {new_observation}',
                                'start': {'dateTime': dt_start.isoformat(), 'timeZone': 'America/Sao_Paulo'},
                                'end': {'dateTime': dt_end.isoformat(), 'timeZone': 'America/Sao_Paulo'},
                            }

                            loop = asyncio.get_running_loop()
                            event = await loop.run_in_executor(
                                None,
                                lambda: service.events().insert(calendarId='primary', body=event_body).execute()
                            )
                            new_observation += f" [Reunião agendada: {event.get('htmlLink')}]"
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

                    # --- PAUSA AUTOMÁTICA EM CASO DE ERRO ---
                    if new_status and (str(new_status).startswith("Erro") or str(new_status).startswith("Falha")):
                        logger.warning(f"AGENTE WORKER: Pausando campanha {campaign.id} devido a erro no contato: {new_status}")
                        campaign.status = "Pausado"

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

                    # --- PAUSA A CAMPANHA EM CASO DE ERRO ---
                    try:
                        logger.warning(f"Pausando campanha {campaign_id} devido a erro crítico no processamento.")
                        campaign_to_pause = await db.get(models.Prospect, campaign_id)
                        if campaign_to_pause:
                            campaign_to_pause.status = "Pausado"
                            db.add(campaign_to_pause)
                            await db.commit()
                    except Exception as pause_error:
                        logger.error(f"Erro ao tentar pausar campanha {campaign_id}: {pause_error}")

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