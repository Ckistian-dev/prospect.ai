import aio_pika
import os
import json
import logging
import asyncio

logger = logging.getLogger(__name__)

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")
QUEUE_NAME = "webhook_queue"

async def send_webhook_to_queue(webhook_data: dict):
    """
    Envia o payload do webhook para a fila RabbitMQ de forma assíncrona.
    """
    try:
        connection = await aio_pika.connect_robust(RABBITMQ_URL)
        async with connection:
            channel = await connection.channel()
            
            # Garante que a fila existe e é durável
            await channel.declare_queue(QUEUE_NAME, durable=True)

            message_body = json.dumps(webhook_data).encode()

            message = aio_pika.Message(
                body=message_body,
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT
            )

            await channel.default_exchange.publish(
                message,
                routing_key=QUEUE_NAME
            )
            # logger.info(f"Webhook enviado para a fila '{QUEUE_NAME}'")

    except Exception as e:
        logger.error(f"Erro ao enviar webhook para RabbitMQ: {e}", exc_info=True)
