import httpx
from app.core.config import settings
import logging
import json
from typing import Dict, Any, List, Optional
import base64
import os
import subprocess
import uuid
import tempfile

logger = logging.getLogger(__name__)

class WhatsAppService:
    def __init__(self):
        self.api_url = settings.EVOLUTION_API_URL
        self.api_key = settings.EVOLUTION_API_KEY
        self.headers = {"apikey": self.api_key, "Content-Type": "application/json"}

    # --- NOVO MÉTODO PARA NORMALIZAR NÚMEROS ---
    def _normalize_number(self, number: str) -> str:
        """
        Garante que o número de celular brasileiro seja enviado sem o nono dígito.
        Ex: Converte '5545999861237' (13 dígitos) para '554599861237' (12 dígitos).
        """
        clean_number = "".join(filter(str.isdigit, str(number)))
        
        # A regra se aplica a números com 13 dígitos (55 + DDD + 9 + 8 dígitos)
        if len(clean_number) == 13 and clean_number.startswith("55"):
            # A parte do número após o código de país (55) e DDD (XX)
            subscriber_part = clean_number[4:]
            if subscriber_part.startswith('9'):
                # Retorna o número sem o primeiro '9' da parte do assinante
                normalized = clean_number[:4] + subscriber_part[1:]
                logger.info(f"Normalizando número {clean_number} para {normalized}")
                return normalized
        
        # Se não se encaixar na regra, retorna o número limpo original
        return clean_number

    # ... (outros métodos como get_connection_status, etc., permanecem iguais)
    async def get_connection_status(self, instance_name: str) -> dict:
        if not instance_name:
            return {"status": "no_instance_name"}
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.api_url}/instance/connectionState/{instance_name}",
                    headers={"apikey": self.api_key}
                )
                response.raise_for_status()
                data = response.json()
                state = data.get("instance", {}).get("state")
                return {"status": "connected"} if state == "open" else {"status": state or "disconnected"}
        except httpx.HTTPStatusError as e:
            return {"status": "disconnected"} if e.response.status_code == 404 else {"status": "api_error", "detail": e.response.text}
        except Exception as e:
            return {"status": "api_error", "detail": str(e)}

    async def _get_qrcode(self, instance_name: str) -> dict:
        async with httpx.AsyncClient(timeout=90.0) as client:
            response = await client.get(f"{self.api_url}/instance/connect/{instance_name}", headers={"apikey": self.api_key})
            response.raise_for_status()
            data = response.json()
            qr_code_string = data.get('code') or data.get('qrcode', {}).get('code')
            if not qr_code_string: raise Exception("API não retornou um QR Code válido.")
            return {"status": "qrcode", "qrcode": qr_code_string}

    async def _create_instance(self, instance_name: str):
        payload = {
            "instanceName": instance_name,
            "integration": "WHATSAPP-BAILEYS",
            "qrcode": True,
            "groupsIgnore": True,
            "alwaysOnline": False,
            "readMessages": False,
            "readStatus": False,
            "syncFullHistory": True,
            "webhook": {
                "url": settings.WEBHOOK_URL,
                "byEvents": True,
                "events": [
                    "MESSAGES_UPSERT",
                    "CONNECTION_UPDATE"
                ]
            }
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(f"{self.api_url}/instance/create", headers=self.headers, json=payload)
            response.raise_for_status()
            logger.info(f"Instância '{instance_name}' criada com sucesso.")

    async def create_and_connect_instance(self, instance_name: str) -> dict:
        try:
            return await self._get_qrcode(instance_name)
        except httpx.HTTPStatusError as e:
            if e.response.status_code != 404:
                error_detail = e.response.text if hasattr(e.response, 'text') else str(e)
                logger.error(f"Erro ao conectar na instância '{instance_name}': {error_detail}")
                return {"status": "error", "detail": error_detail}
        
        try:
            await self._create_instance(instance_name)
            return await self._get_qrcode(instance_name)
        except Exception as e:
            error_detail = e.response.text if hasattr(e, 'response') else str(e)
            logger.error(f"Erro ao criar a instância '{instance_name}': {error_detail}")
            return {"status": "error", "detail": error_detail}

    async def disconnect_instance(self, instance_name: str) -> dict:
        try:
            async with httpx.AsyncClient() as client:
                response = await client.delete(f"{self.api_url}/instance/delete/{instance_name}", headers={"apikey": self.api_key})
                if response.status_code not in [200, 201, 404]: response.raise_for_status()
                return {"status": "disconnected"}
        except Exception as e:
            error_detail = e.response.text if hasattr(e, 'response') else str(e)
            return {"status": "error", "detail": error_detail}

    # --- MÉTODO ATUALIZADO ---
    async def send_text_message(self, instance_name: str, number: str, text: str) -> bool:
        if not all([instance_name, number, text]):
            return False
        
        # Normaliza o número ANTES de enviar para a API
        normalized_number = self._normalize_number(number)
        url = f"{self.api_url}/message/sendText/{instance_name}"
        
        payload = {
            "number": normalized_number,
            "text": text,
            "options": { "delay": 1200, "presence": "composing" }
        }
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, headers=self.headers, json=payload)
                response.raise_for_status()
                logger.info(f"DEBUG: Mensagem enviada com sucesso para {normalized_number}.")
                return True
        except httpx.HTTPStatusError as e:
            logger.error(f"Erro ao enviar mensagem para {normalized_number}. Status: {e.response.status_code}. Resposta: {e.response.text}")
            return False
        except Exception as e:
            logger.error(f"Erro inesperado ao enviar mensagem para {normalized_number}: {e}")
            return False

    # --- MÉTODO ATUALIZADO ---
    async def fetch_chat_history(self, instance_name: str, number: str, count: int = 32) -> List[Dict[str, Any]]:
        if not instance_name or not number:
            return []

        # Normaliza o número ANTES de criar o JID para a busca
        normalized_number = self._normalize_number(number)
        url = f"{self.api_url}/chat/findMessages/{instance_name}"
        jid = f"{normalized_number}@s.whatsapp.net"
        
        payload = {
            "page": 1,
            "offset": count,
            "where": {
                "key": {
                    "remoteJid": jid
                }
            }
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                logger.info(f"Buscando as últimas {count} mensagens para o JID normalizado: {jid}...")
                response = await client.post(url, headers=self.headers, json=payload)
                response.raise_for_status()
                data = response.json()

                mensagens = data.get("messages", {}).get("records", [])
                
                logger.info(f"Histórico para {jid} carregado. Total de {len(mensagens)} mensagens encontradas.")
                return mensagens

        except Exception as e:
            logger.error(f"Não foi possível buscar o histórico para {number} (normalizado para {normalized_number}). Erro: {e}")
            return []

    async def get_media_and_convert(self, instance_name: str, message: dict) -> Optional[dict]:
        message_content = message.get("message", {})
        if not message_content: return None

        url = f"{self.api_url}/chat/getBase64FromMediaMessage/{instance_name}"
        payload = {"message": message}
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=payload, headers=self.headers, timeout=60)
                response.raise_for_status()
                media_response = response.json()
            
            base64_data = media_response.get("base64")
            if not base64_data: raise ValueError("API de mídia não retornou 'base64'.")
            media_bytes = base64.b64decode(base64_data)

            if "imageMessage" in message_content:
                return {"mime_type": "image/jpeg", "data": media_bytes}

            if "documentMessage" in message_content:
                mime_type = message_content["documentMessage"].get("mimetype", "application/octet-stream")
                return {"mime_type": mime_type, "data": media_bytes}

            if "audioMessage" in message_content:
                with tempfile.TemporaryDirectory() as temp_dir:
                    ogg_path = os.path.join(temp_dir, f"{uuid.uuid4()}.ogg")
                    mp3_path = os.path.join(temp_dir, f"{uuid.uuid4()}.mp3")
                    
                    with open(ogg_path, "wb") as f: f.write(media_bytes)
                    
                    command = ["ffmpeg", "-y", "-i", ogg_path, "-acodec", "libmp3lame", mp3_path]
                    subprocess.run(command, check=True, capture_output=True, text=True)
                    
                    with open(mp3_path, "rb") as f: mp3_bytes = f.read()
                    
                    return {"mime_type": "audio/mp3", "data": mp3_bytes}

        except subprocess.CalledProcessError as e:
            logger.error(f"Erro do FFmpeg (verifique se está instalado e no PATH): {e.stderr}")
        except Exception as e:
            logger.error(f"Falha ao processar mídia da mensagem: {e}")
        
        return None

_whatsapp_service_instance = None
def get_whatsapp_service():
    global _whatsapp_service_instance
    if _whatsapp_service_instance is None:
        _whatsapp_service_instance = WhatsAppService()
    return _whatsapp_service_instance