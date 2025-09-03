import logging
import json
from fastapi import APIRouter, Request, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.database import SessionLocal
from app.crud import crud_user, crud_prospect

logger = logging.getLogger(__name__)
router = APIRouter()

async def process_incoming_message(data: dict):
    """
    Processa uma mensagem de entrada. Sua única função é encontrar o contato
    na campanha ativa e atualizar seu status para 'Resposta Recebida'.
    O agente principal cuidará do resto.
    """
    async with SessionLocal() as db:
        try:
            instance_name = data.get('instance')
            message_data = data.get('data', {})
            key = message_data.get('key', {})
            contact_number = key.get('remoteJid', '').split('@')[0]
            
            message_content = message_data.get('message', {})
            incoming_text = message_content.get('conversation') or \
                            message_content.get('extendedTextMessage', {}).get('text', '')

            if not all([instance_name, contact_number, incoming_text]):
                return

            user = await crud_user.get_user_by_instance(db, instance_name=instance_name)
            if not user: return

            prospect_info = await crud_prospect.find_active_prospect_contact_by_number(db, user_id=user.id, number=contact_number)
            if not prospect_info: return

            contact, prospect_contact, prospect = prospect_info
            
            # Adiciona a nova mensagem ao histórico
            try:
                history_list = json.loads(prospect_contact.conversa)
            except (json.JSONDecodeError, TypeError):
                history_list = []
            
            history_list.append({"role": "user", "content": incoming_text})
            new_conversation_history = json.dumps(history_list)

            # Atualiza o status e a conversa
            await crud_prospect.update_prospect_contact(
                db, 
                pc_id=prospect_contact.id, 
                situacao="Resposta Recebida",
                conversa=new_conversation_history
            )
            logger.info(f"Mensagem de '{contact.nome}' na campanha '{prospect.nome_prospeccao}' marcada para processamento pelo agente.")

        except Exception as e:
            logger.error(f"ERRO CRÍTICO no processamento do webhook: {e}", exc_info=True)

@router.post("/evolution/messages-upsert", summary="Receber eventos de novas mensagens")
async def receive_evolution_messages_upsert(
    request: Request,
    background_tasks: BackgroundTasks
):
    try:
        data = await request.json()
        is_new_message = (
            data.get("event") == "messages.upsert" and
            not data.get("data", {}).get("key", {}).get("fromMe", False)
        )

        if is_new_message:
            background_tasks.add_task(process_incoming_message, data)

        return {"status": "message_received"}
    except Exception as e:
        logger.error(f"Erro ao processar corpo do webhook: {e}")
        return {"status": "error"}

