import logging
from fastapi import APIRouter, Request, HTTPException, BackgroundTasks, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.crud import crud_user, crud_prospect
from app.db.schemas import UserUpdate

logger = logging.getLogger(__name__)
router = APIRouter()

def _normalize_number(number: str) -> str:
    """Garante que o número de celular brasileiro seja processado sem o nono dígito."""
    clean_number = "".join(filter(str.isdigit, str(number)))
    # Se não começa com 55 e tem 10 ou 11 dígitos, assume Brasil e adiciona 55
    if not clean_number.startswith("55") and len(clean_number) in [10, 11]:
        clean_number = "55" + clean_number

    if len(clean_number) == 13 and clean_number.startswith("55"):
        if clean_number[4] == '9':
            normalized = clean_number[:4] + clean_number[5:]
            logger.info(f"Normalizando número do webhook de {clean_number} para {normalized}")
            return normalized
    return clean_number

async def _process_new_message(db: AsyncSession, data: dict):
    """Processa eventos de nova mensagem recebida."""
    instance_name = data.get('instance')
    message_data = data.get('data', {})
    key = message_data.get('key', {})

    # A Evolution API pode enviar o ID interno (LID) no remoteJid.
    # O número de telefone real costuma vir no remoteJidAlt quando addressingMode é 'lid'.
    remote_jid = key.get('remoteJid', '')
    remote_jid_alt = key.get('remoteJidAlt', '')
    
    contact_number_full = remote_jid_alt if "@lid" in remote_jid and remote_jid_alt else remote_jid

    if not contact_number_full or "@g.us" in contact_number_full:
        return

    contact_number = contact_number_full.split('@')[0]
    normalized_contact_number = _normalize_number(contact_number)
    
    user = await crud_user.get_user_by_instance(db, instance_name=instance_name)
    if not user:
        logger.warning(f"Webhook: Usuário não encontrado para a instância {instance_name}")
        return

    prospect_info = await crud_prospect.find_prospect_contact_by_number(db, user_id=user.id, number=normalized_contact_number)
    if not prospect_info:
        return
    
    _contact, prospect_contact, _prospect = prospect_info

    situacoes_de_parada = ["Não Interessado", "Concluído", "Falha no Envio"]
    if prospect_contact.situacao in situacoes_de_parada:
        return

    await crud_prospect.update_prospect_contact_status(db, pc_id=prospect_contact.id, situacao="Resposta Recebida")
    logger.info(f"WEBHOOK: Contato da Prospecção ID {prospect_contact.id} para {contact_number} marcado como 'Resposta Recebida'.")
    await db.commit()


async def process_webhook_event(db: AsyncSession, data: dict):
    """Processa o evento do webhook em segundo plano."""
    try:
        event = data.get("event")
        if event == "messages.upsert":
            await _process_new_message(db, data)
        else:
            logger.info(f"Webhook: Evento '{event}' ignorado.")
    except Exception as e:
        logger.error(f"ERRO CRÍTICO no processamento do webhook: {e}", exc_info=True)
        await db.rollback()
    finally:
        await db.close()

@router.post("", summary="Receber eventos de webhook da Evolution API")
async def receive_evolution_webhook(request: Request, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    try:
        data = await request.json()
        event = data.get("event")

        # A lógica de validação permanece na API para descartar eventos irrelevantes rapidamente
        is_new_message = (
            event == "messages.upsert" and
            not data.get("data", {}).get("key", {}).get("fromMe", False)
        )

        is_connection_update = event == "connection.update"

        if is_new_message or is_connection_update:
            background_tasks.add_task(process_webhook_event, db, data)
            if is_connection_update:
                return {"status": "connection_update_processing"}
            return {"status": "message_processing"}

        return {"status": "event_ignored"}
    except Exception as e:
        logger.error(f"Erro ao processar corpo do webhook: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON data")