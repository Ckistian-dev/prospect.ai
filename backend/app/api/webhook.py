import logging
from fastapi import APIRouter, Request, HTTPException, BackgroundTasks

from app.services.message_producer import send_webhook_to_queue

logger = logging.getLogger(__name__)
router = APIRouter()

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
            # Envia para o RabbitMQ processar
            background_tasks.add_task(send_webhook_to_queue, data)
            return {"status": "queued"}

        return {"status": "event_ignored"}
    except Exception as e:
        logger.error(f"Erro ao processar corpo do webhook: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON data")