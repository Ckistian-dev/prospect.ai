import logging
import json
from fastapi import APIRouter, Request, BackgroundTasks
from app.db.database import SessionLocal
from app.crud import crud_user, crud_prospect

logger = logging.getLogger(__name__)
router = APIRouter()

async def process_incoming_message(data: dict):
    """
    Processa uma mensagem, identifica se contém mídia (imagem, áudio, documento)
    e atualiza o contato para que o agente principal possa processá-la.
    """
    async with SessionLocal() as db:
        try:
            instance_name = data.get('instance')
            message_data = data.get('data', {})
            key = message_data.get('key', {})
            contact_number = key.get('remoteJid', '').split('@')[0]
            
            message_content = message_data.get('message', {})
            if not message_content: return

            user = await crud_user.get_user_by_instance(db, instance_name=instance_name)
            if not user: return

            prospect_info = await crud_prospect.find_active_prospect_contact_by_number(db, user_id=user.id, number=contact_number)
            if not prospect_info: return

            contact, prospect_contact, prospect = prospect_info
            
            # Identifica o tipo de conteúdo e prepara o placeholder para o histórico
            media_type = None
            content_for_history = ""

            if message_content.get('conversation') or message_content.get('extendedTextMessage'):
                content_for_history = message_content.get('conversation') or message_content.get('extendedTextMessage', {}).get('text', '')
            elif message_content.get("imageMessage"):
                media_type = "image"
                content_for_history = "[Imagem Recebida]"
            elif message_content.get("audioMessage"):
                media_type = "audio"
                content_for_history = "[Áudio Recebido]"
            elif message_content.get("documentMessage"):
                media_type = "document"
                file_name = message_content.get("documentMessage", {}).get("fileName", "documento")
                content_for_history = f"[Documento Recebido: {file_name}]"

            if not content_for_history:
                return # Ignora mensagens sem conteúdo útil

            try:
                history_list = json.loads(prospect_contact.conversa) if prospect_contact.conversa else []
            except (json.JSONDecodeError, TypeError):
                history_list = []
            
            history_list.append({"role": "user", "content": content_for_history})
            new_conversation_history = json.dumps(history_list)

            # Atualiza o contato, marcando-o para ser processado pelo agente
            await crud_prospect.update_prospect_contact(
                db, 
                pc_id=prospect_contact.id, 
                situacao="Resposta Recebida",
                conversa=new_conversation_history,
                media_type=media_type  # Salva o tipo de mídia
            )
            logger.info(f"Mensagem de '{contact.nome}' na campanha '{prospect.nome_prospeccao}' marcada para processamento.")

        except Exception as e:
            logger.error(f"ERRO CRÍTICO no processamento do webhook: {e}", exc_info=True)

@router.post("/evolution/messages-upsert", summary="Receber eventos de novas mensagens")
async def receive_evolution_messages_upsert(request: Request, background_tasks: BackgroundTasks):
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

