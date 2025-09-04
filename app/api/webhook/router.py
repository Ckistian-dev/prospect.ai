import logging
import json
from fastapi import APIRouter, Request, BackgroundTasks
from app.db.database import SessionLocal
from app.crud import crud_user, crud_prospect
from app.services.whatsapp_service import get_whatsapp_service
from app.services.gemini_service import get_gemini_service

logger = logging.getLogger(__name__)
router = APIRouter()

async def process_incoming_message(data: dict):
    """
    Processa uma mensagem, transcreve/analisa mídias imediatamente,
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
            
            whatsapp_service = get_whatsapp_service()
            gemini_service = get_gemini_service()

            content_for_history = ""
            is_media = False
            media_type_for_check = ""

            if message_content.get('conversation') or message_content.get('extendedTextMessage'):
                content_for_history = message_content.get('conversation') or message_content.get('extendedTextMessage', {}).get('text', '')
            elif message_content.get("imageMessage") or message_content.get("audioMessage") or message_content.get("documentMessage"):
                is_media = True
            
            if not content_for_history and not is_media:
                logger.warning(f"DEBUG [Webhook]: Mensagem de {contact.nome} ignorada por falta de conteúdo útil.")
                return

            try:
                history_list = json.loads(prospect_contact.conversa) if prospect_contact.conversa else []
            except (json.JSONDecodeError, TypeError):
                history_list = []
            
            if is_media:
                logger.info(f"DEBUG [Webhook]: Mídia detectada para {contact.nome}. Baixando e processando...")
                media_data = await whatsapp_service.get_media_and_convert(instance_name, message_data)
                
                if media_data:
                    logger.info(f"DEBUG [Webhook]: Mídia baixada. Enviando para análise da IA...")
                    transcription = gemini_service.transcribe_and_analyze_media(media_data, history_list)
                    content_for_history = transcription
                    
                    # Decrementa tokens com base no tipo de mídia
                    token_cost = 2 if 'audio' not in media_data.get('mime_type', '') else 1
                    logger.info(f"DEBUG [Webhook]: Descontando {token_cost} token(s) pela análise de mídia.")
                    await crud_user.decrement_user_tokens(db, db_user=user, amount=token_cost)
                else:
                    content_for_history = "[Falha ao processar mídia recebida]"
            
            if not content_for_history.strip():
                 logger.warning(f"DEBUG [Webhook]: Conteúdo final para o histórico de {contact.nome} está vazio. Ignorando.")
                 return

            history_list.append({"role": "user", "content": content_for_history})
            new_conversation_history = json.dumps(history_list)

            await crud_prospect.update_prospect_contact(
                db, 
                pc_id=prospect_contact.id, 
                situacao="Resposta Recebida",
                conversa=new_conversation_history,
                media_type=None  # Limpa a flag de mídia, pois ela já foi processada
            )
            logger.info(f"DEBUG [Webhook]: Mensagem de '{contact.nome}' processada e marcada para resposta do agente.")

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

