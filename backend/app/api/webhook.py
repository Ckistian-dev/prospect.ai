import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Request, HTTPException, BackgroundTasks

from app.db.database import SessionLocal
from app.crud import crud_user, crud_prospect

logger = logging.getLogger(__name__)
router = APIRouter()

def _normalize_number(number: str) -> str:
    """Garante que o número de celular brasileiro seja processado sem o nono dígito."""
    clean_number = "".join(filter(str.isdigit, str(number)))
    if not clean_number.startswith("55") and len(clean_number) in [10, 11]:
        clean_number = "55" + clean_number

    if len(clean_number) == 13 and clean_number.startswith("55"):
        if clean_number[4] == '9':
            normalized = clean_number[:4] + clean_number[5:]
            return normalized
    return clean_number

async def process_webhook_message(data: dict):
    """Processa a mensagem recebida do webhook diretamente."""
    try:
        instance_name = data.get('instance')
        message_data = data.get('data', {})
        key = message_data.get('key', {})
        
        remote_jid = key.get('remoteJid', '')
        remote_jid_alt = key.get('remoteJidAlt', '')
        contact_number_full = remote_jid_alt if "@lid" in remote_jid and remote_jid_alt else remote_jid

        if not contact_number_full or "@g.us" in contact_number_full:
            return

        contact_number = contact_number_full.split('@')[0]
        normalized_contact_number = _normalize_number(contact_number)
        
        async with SessionLocal() as db:
            user = await crud_user.get_user_by_instance(db, instance_name=instance_name)
            if not user:
                logger.warning(f"Webhook: Usuário não encontrado para a instância {instance_name}")
                return

            prospect_info = await crud_prospect.find_prospect_contact_by_number(db, user_id=user.id, number=normalized_contact_number)
            if not prospect_info:
                logger.info(f"Webhook: Contato {normalized_contact_number} não encontrado em nenhuma prospecção para o usuário {user.id}.")
                return
            
            _contact, prospect_contact, prospect = prospect_info

            situacoes_de_parada = ["Não Interessado", "Concluído", "Falha no Envio", "Conversa Manual", "Fechado"]
            if prospect_contact.situacao in situacoes_de_parada:
                logger.info(f"Webhook: Contato {contact_number} encontrado, mas em situação terminal ({prospect_contact.situacao}). Ignorando.")
                return

            prospect_contact.situacao = "Resposta Recebida"
            prospect_contact.updated_at = datetime.now(timezone.utc)
            
            await db.commit()
            logger.info(f"Webhook: Mensagem de {contact_number} recebida. Status atualizado para 'Resposta Recebida'.")

    except Exception as e:
        logger.error(f"Erro ao processar mensagem no webhook: {e}", exc_info=True)

@router.post("", summary="Receber eventos de webhook da Evolution API")
async def receive_evolution_webhook(request: Request, background_tasks: BackgroundTasks):
    try:
        data = await request.json()
        event = data.get("event")

        # Validação rápida para descartar eventos irrelevantes
        is_new_message = (
            event == "messages.upsert" and
            not data.get("data", {}).get("key", {}).get("fromMe", False)
        )

        # is_connection_update = event == "connection.update" # Opcional: processar conexão se necessário

        if is_new_message:
            # Processa diretamente em background
            background_tasks.add_task(process_webhook_message, data)
            return {"status": "processing"}

        return {"status": "event_ignored"}
    except Exception as e:
        logger.error(f"Erro ao processar corpo do webhook: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON data")