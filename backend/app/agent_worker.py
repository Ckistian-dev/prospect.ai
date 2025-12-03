import asyncio
import logging
import os
import json

from app.db.database import SessionLocal
from app.crud import crud_prospect, crud_user, crud_config
from app.services.whatsapp_service import get_whatsapp_service
from app.services.gemini_service import get_gemini_service

# Configuração do logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

async def process_pending_prospects():
    """
    Busca e processa contatos de prospecção que receberam uma resposta
    e estão aguardando a próxima ação do agente de IA.
    """
    logger.info("AGENTE WORKER: Verificando prospecções com respostas recebidas...")
    
    # Usamos um bloco 'async with' para garantir que a sessão seja fechada
    async with SessionLocal() as db:
        try:
            # Busca todos os contatos de prospecções ativas que têm status "Resposta Recebida"
            prospects_to_process = await crud_prospect.get_all_pending_reply_contacts(db)
            
            if not prospects_to_process:
                logger.info("AGENTE WORKER: Nenhuma prospecção para processar no momento.")
                return
            
            logger.info(f"AGENTE WORKER: {len(prospects_to_process)} prospecções encontradas para processamento.")

            # Obtém instâncias dos serviços fora do loop para reutilização
            whatsapp_service = get_whatsapp_service()
            gemini_service = get_gemini_service()

            for prospect_contact, prospect, contact in prospects_to_process:
                logger.info(f"AGENTE WORKER: Processando Contato da Prospecção ID {prospect_contact.id} para o número {contact.whatsapp}")

                # 1. Atualiza o status para "Processando" para evitar que outro worker pegue a mesma tarefa
                await crud_prospect.update_prospect_contact_status(db, pc_id=prospect_contact.id, situacao="Processando")
                await db.commit()

                try:
                    # 2. Obtém o usuário e a configuração da prospecção
                    user = await crud_user.get_user(db, user_id=prospect.user_id)
                    if not user or not user.instance_name:
                        logger.warning(f"Usuário {prospect.user_id} ou nome da instância não encontrado. Pulando.")
                        await crud_prospect.update_prospect_contact_status(db, pc_id=prospect_contact.id, situacao="Falha no Envio")
                        await db.commit()
                        continue
                    
                    # O gemini_service precisa do objeto Config, não do dicionário.
                    config = await crud_config.get_config(db, config_id=prospect.config_id, user_id=user.id)
                    if not config:
                        logger.warning(f"Usuário {user.id} não possui uma configuração de IA ativa. Pulando.")
                        await crud_prospect.update_prospect_contact_status(db, pc_id=prospect_contact.id, situacao="Falha no Envio")
                        await db.commit()
                        continue

                    # 3. Busca o histórico da conversa
                    # O gemini_service espera um formato específico de histórico.
                    # Por enquanto, vamos passar o histórico do banco de dados do ProspectContact.
                    try:
                        conversation_history_db = json.loads(prospect_contact.conversa) if prospect_contact.conversa else []
                    except json.JSONDecodeError:
                        conversation_history_db = []

                    # 4. Gera a ação usando o gemini_service (que é mais completo)
                    # O modo 'reply' é o mais adequado aqui, pois estamos respondendo a uma mensagem.
                    ai_action = await gemini_service.generate_conversation_action(
                        config=config,
                        contact=contact,
                        conversation_history_db=conversation_history_db,
                        mode='reply',
                        db=db, # Passa a sessão do DB para o débito de tokens
                        user=user
                    )

                    ai_response_message = ai_action.get("mensagem_para_enviar")

                    if not ai_response_message:
                        logger.warning(f"AGENTE WORKER: IA não gerou uma mensagem para o Contato ID {contact.id}. Ação: {ai_action}")
                        # Se não houver mensagem, apenas atualizamos o status e observações
                        await crud_prospect.update_prospect_contact(db, pc_id=prospect_contact.id, situacao=ai_action.get("nova_situacao", "Erro IA"), observacoes=ai_action.get("observacoes"))
                        continue

                    # 5. Envia a mensagem via WhatsApp
                    await whatsapp_service.send_text_message(user.instance_name, contact.whatsapp, ai_response_message)
                    logger.info(f"AGENTE WORKER: Mensagem enviada para {contact.whatsapp}.")

                    # 6. Atualiza o status e observações conforme a resposta da IA
                    await crud_prospect.update_prospect_contact(db, pc_id=prospect_contact.id, situacao=ai_action.get("nova_situacao", "Aguardando Resposta"), observacoes=ai_action.get("observacoes"))
                    await db.commit()

                except Exception as e:
                    logger.error(f"AGENTE WORKER: Erro ao processar Contato da Prospecção ID {prospect_contact.id}: {e}", exc_info=True)
                    # Em caso de falha, reverte para "Falha no Envio" para análise
                    await db.rollback()
                    await crud_prospect.update_prospect_contact_status(db, pc_id=prospect_contact.id, situacao="Falha no Envio")
                    await db.commit()

        except Exception as e:
            logger.error(f"AGENTE WORKER: Erro crítico ao buscar prospecções: {e}", exc_info=True)
            await db.rollback()

async def main():
    """Função principal que executa o worker em um loop infinito."""
    logger.info("🚀 AGENTE WORKER INICIADO 🚀")
    # Lê o intervalo de verificação da variável de ambiente, com um padrão de 30 segundos
    check_interval = int(os.getenv("AGENT_WORKER_INTERVAL", "30"))
    
    while True:
        await process_pending_prospects()
        logger.info(f"AGENTE WORKER: Aguardando {check_interval} segundos para a próxima verificação...")
        await asyncio.sleep(check_interval)

if __name__ == "__main__":
    # Garante que o loop de eventos asyncio seja executado
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("AGENTE WORKER: Desligamento solicitado. Encerrando.")