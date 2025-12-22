import asyncio
import logging
import os
import json
import random
from datetime import datetime, timezone, timedelta

from app.db.database import SessionLocal
from app.db import models
from app.crud import crud_prospect, crud_user, crud_config
from app.services.whatsapp_service import get_whatsapp_service, MessageSendError
from app.services.gemini_service import get_gemini_service
from app.services.google_drive_service import get_drive_service
from app.api.prospecting import _synchronize_and_process_history

# Configuração do logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Dicionário para rastrear o último envio de cada campanha
last_message_sent_times = {}

async def process_active_prospects():
    """
    Busca campanhas de prospecção ativas e processa o próximo contato de cada uma,
    seja para uma resposta, follow-up ou mensagem inicial.
    """
    logger.info("AGENTE WORKER: Verificando campanhas ativas para processamento...")
    
    async with SessionLocal() as db:
        try:
            # 1. Busca todas as campanhas com status "Em Andamento"
            active_campaigns = await crud_prospect.get_active_campaigns(db)
            
            if not active_campaigns:
                logger.info("AGENTE WORKER: Nenhuma campanha ativa para processar no momento.")
                return
            
            logger.info(f"AGENTE WORKER: {len(active_campaigns)} campanhas ativas encontradas.")

            whatsapp_service = get_whatsapp_service()
            gemini_service = get_gemini_service()
            drive_service = get_drive_service()

            # 2. Itera sobre cada campanha ativa
            for campaign in active_campaigns:
                try:
                    user = await crud_user.get_user(db, user_id=campaign.user_id)
                    if not user or not user.instance_name:
                        logger.warning(f"Usuário {campaign.user_id} ou nome da instância não encontrado para a campanha {campaign.id}. Pulando.")
                        continue

                    # 3. Encontra o próximo contato a ser processado para esta campanha
                    contact_to_process = await crud_prospect.get_prospects_para_processar(db, campaign)

                    if not contact_to_process:
                        logger.info(f"Nenhum contato para processar na campanha {campaign.id} no momento.")
                        continue
                    
                    pc, contact = contact_to_process
                    mode = "reply" if pc.situacao == "Resposta Recebida" else ("initial" if pc.situacao == "Aguardando Início" else "followup")
                    
                    logger.info(f"AGENTE WORKER: Contato selecionado: '{contact.nome}' (Campanha: {campaign.id}, Modo: {mode}).")

                    # 4. Lógica de controle de tempo e horário (para 'initial' e 'followup')
                    if mode in ['initial', 'followup']:
                        if campaign.horario_inicio and campaign.horario_fim:
                            now_time = datetime.now().time()
                            if not (campaign.horario_inicio <= now_time <= campaign.horario_fim):
                                logger.info(f"Campanha {campaign.id} fora do horário de funcionamento. Pausando verificação para esta campanha.")
                                continue
                        
                        interval_seconds = campaign.initial_message_interval_seconds
                        last_sent = last_message_sent_times.get(campaign.id, datetime.min.replace(tzinfo=timezone.utc))
                        time_since_last = (datetime.now(timezone.utc) - last_sent).total_seconds()

                        if time_since_last < interval_seconds:
                            logger.info(f"Aguardando intervalo de {interval_seconds}s para a campanha {campaign.id}. Faltam {interval_seconds - time_since_last:.1f}s.")
                            continue
                    
                    # 5. Processamento do contato
                    await crud_prospect.update_prospect_contact_status(db, pc_id=pc.id, situacao="Processando")
                    await db.commit()

                    persona_config = await crud_config.get_config(db, config_id=campaign.config_id, user_id=user.id)
                    if not persona_config:
                        logger.error(f"Persona não encontrada para a campanha {campaign.id}. Pausando prospecção.")
                        campaign.status = "Pausado"
                        await crud_prospect.update_prospect_contact(db, pc_id=pc.id, situacao="Erro: Persona não encontrada", observacoes="A configuração de IA associada não foi encontrada.")
                        await db.commit()
                        continue

                    full_history = await _synchronize_and_process_history(db, pc, user, persona_config, whatsapp_service, gemini_service)

                    if mode == 'reply' and (not full_history or full_history[-1]['role'] != 'user'):
                        logger.info(f"Contato {pc.id} em modo 'reply' mas a última mensagem não é do usuário. Revertendo para 'Aguardando Resposta'.")
                        await crud_prospect.update_prospect_contact_status(db, pc.id, situacao="Aguardando Resposta")
                        await db.commit()
                        continue
                    
                    ia_response = await gemini_service.generate_conversation_action(
                        config=persona_config, contact=contact, conversation_history_db=full_history,
                        mode=mode, db=db, user=user
                    )

                    message_to_send = ia_response.get("mensagem_para_enviar")
                    new_status = ia_response.get("nova_situacao", "Aguardando Resposta")
                    new_observation = ia_response.get("observacoes", "")
                    files_to_send = ia_response.get("arquivos_anexos", [])
                    ia_tokens_used = ia_response.get("token_usage", 0)
                    
                    history_after_response = full_history.copy()
                    sent_any_message = False
                    
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
                                await whatsapp_service.send_presence(user.instance_name, contact.whatsapp, "composing", delay=int(typing_delay * 1000))
                                await asyncio.sleep(typing_delay)

                                await whatsapp_service.send_text_message(user.instance_name, contact.whatsapp, part)
                                logger.info(f"AGENTE WORKER: Parte da mensagem enviada para {contact.whatsapp}.")
                                pending_id = f"sent_{datetime.now(timezone.utc).isoformat()}_{random.randint(1000, 9999)}"
                                history_after_response.append({"id": pending_id, "role": "assistant", "content": part})

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
                                        instance_name=user.instance_name,
                                        number=contact.whatsapp,
                                        media=file_data['base64'],
                                        media_type=media_type,
                                        mime_type=mime,
                                        file_name=file_data['file_name']
                                    )
                                    logger.info(f"AGENTE WORKER: Arquivo {file_data['file_name']} enviado com sucesso.")
                                    
                                    pending_id = f"sent_file_{datetime.now(timezone.utc).isoformat()}"
                                    history_after_response.append({"id": pending_id, "role": "assistant", "content": f"[Arquivo enviado: {file_data['file_name']}]"})
                                    sent_any_message = True
                            except Exception as e:
                                logger.error(f"AGENTE WORKER: Falha ao enviar arquivo {file_id}: {e}")

                    if not sent_any_message:
                        logger.info(f"AGENTE WORKER: IA decidiu não enviar mensagem para {contact.whatsapp} (Modo: {mode}).")
                        pending_id = f"internal_{datetime.now(timezone.utc).isoformat()}"
                        history_after_response.append({"id": pending_id, "role": "assistant", "content": f"[Ação Interna: Não responder - Modo: {mode}]"})
                    elif mode in ['initial', 'followup']:
                        last_message_sent_times[campaign.id] = datetime.now(timezone.utc)

                    # --- PAUSA AUTOMÁTICA EM CASO DE ERRO ---
                    if new_status and (str(new_status).startswith("Erro") or str(new_status).startswith("Falha")):
                        logger.warning(f"AGENTE WORKER: Pausando campanha {campaign.id} devido a erro no contato: {new_status}")
                        campaign.status = "Pausado"

                    await crud_prospect.update_prospect_contact(
                        db, pc_id=pc.id, situacao=new_status,
                        conversa=json.dumps(history_after_response), 
                        observacoes=new_observation,
                        tokens_to_add=ia_tokens_used
                    )
                    # O commit já é feito dentro do crud_prospect.update_prospect_contact

                except Exception as e:
                    logger.error(f"AGENTE WORKER: Erro ao processar campanha ID {campaign.id}: {e}", exc_info=True)
                    await db.rollback()

                    # --- PAUSA A CAMPANHA EM CASO DE ERRO ---
                    try:
                        logger.warning(f"Pausando campanha {campaign.id} devido a erro crítico no processamento.")
                        campaign_to_pause = await db.get(models.Prospect, campaign.id)
                        if campaign_to_pause:
                            campaign_to_pause.status = "Pausado"
                            db.add(campaign_to_pause)
                            await db.commit()
                    except Exception as pause_error:
                        logger.error(f"Erro ao tentar pausar campanha {campaign.id}: {pause_error}")

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