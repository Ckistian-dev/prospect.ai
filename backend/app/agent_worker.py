import asyncio
import logging
import os
import json
import random
from datetime import datetime, timezone, timedelta

from app.db.database import SessionLocal
from app.crud import crud_prospect, crud_user, crud_config
from app.services.whatsapp_service import get_whatsapp_service, MessageSendError
from app.services.gemini_service import get_gemini_service
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
                    
                    history_after_response = full_history.copy()
                    
                    if message_to_send and str(message_to_send).strip():
                        try:
                            await whatsapp_service.send_text_message(user.instance_name, contact.whatsapp, message_to_send)
                            logger.info(f"AGENTE WORKER: Mensagem enviada para {contact.whatsapp}.")
                            pending_id = f"sent_{datetime.now(timezone.utc).isoformat()}"
                            history_after_response.append({"id": pending_id, "role": "assistant", "content": message_to_send})
                            
                            if mode in ['initial', 'followup']:
                                last_message_sent_times[campaign.id] = datetime.now(timezone.utc)

                        except MessageSendError as e:
                            logger.error(f"AGENTE WORKER: Falha ao enviar mensagem para {contact.whatsapp}. Erro: {e}")
                            new_status = "Falha no Envio"
                            new_observation = f"Falha no envio via WhatsApp: {e}"
                    else:
                        logger.info(f"AGENTE WORKER: IA decidiu não enviar mensagem para {contact.whatsapp} (Modo: {mode}).")
                        pending_id = f"internal_{datetime.now(timezone.utc).isoformat()}"
                        history_after_response.append({"id": pending_id, "role": "assistant", "content": f"[Ação Interna: Não responder - Modo: {mode}]"})

                    await crud_prospect.update_prospect_contact(
                        db, pc_id=pc.id, situacao=new_status,
                        conversa=json.dumps(history_after_response), observacoes=new_observation
                    )
                    await db.commit()

                except Exception as e:
                    logger.error(f"AGENTE WORKER: Erro ao processar campanha ID {campaign.id}: {e}", exc_info=True)
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