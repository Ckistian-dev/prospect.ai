import aio_pika
import json
import logging
import asyncio
import os
import signal
from datetime import datetime, timezone
from sqlalchemy import select

from app.db.database import SessionLocal
from app.crud import crud_user, crud_prospect, crud_config
from app.db import models
from app.services.whatsapp_service import get_whatsapp_service
from app.services.gemini_service import get_gemini_service

# Configuração de logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")
QUEUE_NAME = "webhook_queue"

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

def _extract_message_content(message_data: dict) -> str:
    """Extrai o texto ou descrição da mídia da mensagem da Evolution API."""
    msg_content = message_data.get('message', {})
    
    if 'conversation' in msg_content:
        return msg_content['conversation']
    if 'extendedTextMessage' in msg_content:
        return msg_content['extendedTextMessage'].get('text', '')
    if 'imageMessage' in msg_content:
        return msg_content['imageMessage'].get('caption', '[Imagem]')
    if 'videoMessage' in msg_content:
        return msg_content['videoMessage'].get('caption', '[Vídeo]')
    if 'documentMessage' in msg_content:
        return msg_content['documentMessage'].get('caption', '[Documento]')
    if 'audioMessage' in msg_content:
        return '[Áudio]'
    
    return ''

def _get_message_timestamp(msg: dict) -> str:
    """Extrai o timestamp da mensagem, com fallback para o ID se necessário."""
    ts = msg.get("timestamp")
    if ts:
        return ts
    
    # Fallback: Tenta extrair do ID (formato sent_TIMESTAMP_RANDOM)
    msg_id = str(msg.get("id", ""))
    if msg_id.startswith(("sent_", "internal_")):
        try:
            parts = msg_id.split('_')
            if len(parts) >= 2:
                return parts[1]
        except:
            pass
            
    return "1970-01-01T00:00:00+00:00"

async def process_message(body: bytes) -> bool:
    """
    Processa a mensagem recebida da fila.
    """
    try:
        data = json.loads(body)
        event = data.get("event")
        
        if event != "messages.upsert":
            return True

        instance_name = data.get('instance')
        message_data = data.get('data', {})
        key = message_data.get('key', {})
        timestamp_unix = message_data.get("messageTimestamp")
        
        # Ignora mensagens enviadas por mim
        if key.get('fromMe', False):
            return True

        # Lógica de extração do número (LID vs RemoteJid)
        remote_jid = key.get('remoteJid', '')
        remote_jid_alt = key.get('remoteJidAlt', '')
        contact_number_full = remote_jid_alt if "@lid" in remote_jid and remote_jid_alt else remote_jid

        if not contact_number_full or "@g.us" in contact_number_full:
            return True

        contact_number = contact_number_full.split('@')[0]
        normalized_contact_number = _normalize_number(contact_number)
        
        async with SessionLocal() as db:
            user = await crud_user.get_user_by_instance(db, instance_name=instance_name)
            if not user:
                logger.warning(f"Worker: Usuário não encontrado para a instância {instance_name}")
                return True # Ack para não travar a fila

            prospect_info = await crud_prospect.find_prospect_contact_by_number(db, user_id=user.id, number=normalized_contact_number)
            if not prospect_info:
                # Contato não está em prospecção ativa, ignorar
                return True
            
            _contact, prospect_contact, prospect = prospect_info

            situacoes_de_parada = ["Não Interessado", "Concluído", "Falha no Envio"]
            if prospect_contact.situacao in situacoes_de_parada:
                return True

            # --- ATUALIZAÇÃO DO HISTÓRICO (Substitui o fetch externo) ---
            
            # Carrega histórico atual (Movido para antes do processamento de mídia para contexto)
            try:
                history = json.loads(prospect_contact.conversa) if prospect_contact.conversa else []
            except:
                history = []

            # Extrai o conteúdo da mensagem
            msg_content = message_data.get('message', {})
            text_content = ""
            
            # Verifica se há mídia (áudio, imagem, vídeo ou documento)
            media_types = ['audioMessage', 'imageMessage', 'videoMessage', 'documentMessage']
            media_type_found = next((mt for mt in media_types if mt in msg_content), None)

            if media_type_found:
                try:
                    whatsapp_service = get_whatsapp_service()
                    gemini_service = get_gemini_service()
                    
                    # CORREÇÃO: Usa get_media_and_convert que já retorna o base64
                    media_data_dict = await whatsapp_service.get_media_and_convert(instance_name, message_data)
                    
                    if media_data_dict:
                        # CORREÇÃO: Busca a configuração associada à campanha (prospect)
                        config = await crud_config.get_config(db, config_id=prospect.config_id, user_id=user.id)

                        if config:
                            # Passa o histórico para análise de imagem/vídeo (contexto), mas não para áudio
                            history_for_analysis = history if 'audio' not in media_data_dict['mime_type'] else None

                            # O media_data_dict já está no formato correto
                            transcription, _ = await gemini_service.transcribe_and_analyze_media(
                                media_data=media_data_dict, 
                                config=config, 
                                db=db, 
                                user=user,
                                db_history=history_for_analysis
                            )
                            
                            if 'audio' in media_data_dict['mime_type']:
                                text_content = f"[Áudio transcrito]: {transcription}"
                            else:
                                text_content = f"[Análise de Mídia]: {transcription}"
                                # Adiciona legenda se existir
                                caption = msg_content[media_type_found].get('caption', '').strip()
                                if caption:
                                    text_content += f"\n[Legenda da Mídia]: {caption}"
                        else:
                            text_content = f"[{media_type_found} recebido - Configuração da campanha não encontrada]"
                            caption = msg_content[media_type_found].get('caption', '').strip()
                            if caption:
                                text_content += f"\n[Legenda]: {caption}"
                    else:
                        text_content = f"[{media_type_found} não processado - Falha no download]"
                        caption = msg_content[media_type_found].get('caption', '').strip()
                        if caption:
                            text_content += f"\n[Legenda]: {caption}"
                except Exception as e:
                    logger.error(f"Worker: Erro ao processar mídia ({media_type_found}): {e}", exc_info=True)
                    text_content = f"[Erro no processamento de mídia: {media_type_found}]"
            else:
                text_content = _extract_message_content(message_data)
            
            # Converte o timestamp da mensagem para ISO format
            timestamp_iso = None
            if timestamp_unix:
                try:
                    timestamp_iso = datetime.fromtimestamp(int(timestamp_unix), tz=timezone.utc).isoformat()
                except (ValueError, TypeError):
                    logger.warning(f"Webhook worker: Não foi possível analisar o timestamp: {timestamp_unix}")
            
            # Fallback para o tempo atual se o timestamp da mensagem não estiver disponível
            if not timestamp_iso:
                timestamp_iso = datetime.now(timezone.utc).isoformat()

            # Adiciona nova mensagem
            new_msg_entry = {
                "role": "user",
                "content": text_content,
                "timestamp": timestamp_iso,
                "id": key.get('id')
            }
            history.append(new_msg_entry)
            
            # Garante a ordem cronológica correta
            history.sort(key=_get_message_timestamp)

            # Atualiza no banco
            prospect_contact.conversa = json.dumps(history)
            prospect_contact.situacao = "Resposta Recebida"
            prospect_contact.updated_at = datetime.now(timezone.utc)
            
            await db.commit()
            logger.info(f"Worker: Mensagem de {contact_number} processada e salva. Status: Resposta Recebida.")

        return True

    except json.JSONDecodeError:
        logger.error("Worker: Erro ao decodificar JSON.")
        return False
    except Exception as e:
        logger.error(f"Worker: Erro ao processar mensagem: {e}", exc_info=True)
        return False

async def main() -> None:
    retries = 0
    while True:
        try:
            connection = await aio_pika.connect_robust(RABBITMQ_URL)
            logger.info("Worker: Conectado ao RabbitMQ.")
            retries = 0 # Reset retries
            
            async with connection:
                channel = await connection.channel()
                await channel.set_qos(prefetch_count=5) # Processa até 5 mensagens em paralelo se necessário
                queue = await channel.declare_queue(QUEUE_NAME, durable=True)

                logger.info(f"Worker: Aguardando mensagens em '{QUEUE_NAME}'...")

                async with queue.iterator() as queue_iter:
                    async for message in queue_iter:
                        async with message.process():
                            await process_message(message.body)
            
            # Se sair do bloco async with, significa que a conexão fechou.
            logger.warning("Worker: Conexão perdida. Reconectando...")
            # REMOVIDO O BREAK PARA GARANTIR RECONEXÃO
        
        except Exception as e:
            retries += 1
            wait_time = min(retries * 2, 30)
            logger.error(f"Worker: Erro na conexão ({e}). Tentando reconectar em {wait_time}s...")
            await asyncio.sleep(wait_time)

if __name__ == '__main__':
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    async def shutdown(sig):
        logger.info(f"Worker: Recebido sinal {sig.name}. Encerrando...")
        tasks = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
        [task.cancel() for task in tasks]
        await asyncio.gather(*tasks, return_exceptions=True)
        loop.stop()

    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, lambda s=sig: asyncio.create_task(shutdown(s)))

    try:
        loop.run_until_complete(main())
    except (asyncio.CancelledError, KeyboardInterrupt):
        pass
    finally:
        loop.close()
        logger.info("Worker finalizado.")
