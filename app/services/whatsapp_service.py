import httpx
from app.core.config import settings
import logging
import json
from typing import Dict, Any

logger = logging.getLogger(__name__)

class WhatsAppService:
    def __init__(self):
        self.api_url = settings.EVOLUTION_API_URL
        self.api_key = settings.EVOLUTION_API_KEY
        self.headers = {"apikey": self.api_key, "Content-Type": "application/json"}

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

    # --- FUNÇÃO CORRIGIDA ---
    async def _create_instance(self, instance_name: str):
        """Cria a instância usando o payload completo e correto."""
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

    async def send_text_message(self, instance_name: str, number: str, text: str) -> bool:
        if not all([instance_name, number, text]):
            return False
        
        clean_number = "".join(filter(str.isdigit, str(number)))
        url = f"{self.api_url}/message/sendText/{instance_name}"
        
        payload = {
            "number": clean_number,
            "text": text,
            "options": { "delay": 1200, "presence": "composing" }
        }
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, headers=self.headers, json=payload)
                response.raise_for_status()
                return True
        except httpx.HTTPStatusError as e:
            logger.error(f"Erro ao enviar mensagem para {clean_number}. Status: {e.response.status_code}. Resposta: {e.response.text}")
            return False
        except Exception as e:
            logger.error(f"Erro inesperado ao enviar mensagem para {clean_number}: {e}")
            return False

    # --- FUNÇÃO CORRIGIDA ---
    async def get_conversation_history(self, instance_name: str, number: str) -> str | None:
        """
        Busca o histórico de mensagens, tentando com e sem o nono dígito.
        """
        if not instance_name or not number: return None
        clean_number = "".join(filter(str.isdigit, str(number)))
        
        # 1. Gera as duas possíveis variações do número
        jids_to_try = set()
        if clean_number.startswith("55") and len(clean_number) >= 12:
            prefix = clean_number[:4]
            if len(clean_number) == 13 and clean_number[4] == '9':
                # Número com 9: gera a versão sem
                jids_to_try.add(f"{clean_number}@s.whatsapp.net")
                jids_to_try.add(f"{prefix + clean_number[5:]}@s.whatsapp.net")
            elif len(clean_number) == 12:
                # Número sem 9: gera a versão com
                jids_to_try.add(f"{clean_number}@s.whatsapp.net")
                jids_to_try.add(f"{prefix}9{clean_number[4:]}@s.whatsapp.net")
        
        # Se não for um formato reconhecido, usa apenas o número limpo
        if not jids_to_try:
            jids_to_try.add(f"{clean_number}@s.whatsapp.net")

        # 2. Tenta buscar o histórico para cada variação
        for jid in jids_to_try:
            url = f"{self.api_url}/chat/findMessages/{instance_name}"
            payload = {"page": 1, "offset": 100, "where": {"key": {"remoteJid": jid}}}
            
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    response = await client.post(url, headers=self.headers, json=payload)
                    response.raise_for_status()
                    data = response.json()
                    
                    messages = data.get("messages", {}).get("records", [])
                    # 3. Se encontrar mensagens, formata e retorna imediatamente
                    if messages:
                        logger.info(f"Histórico encontrado com sucesso para a variação JID: {jid}")
                        sorted_messages = sorted(messages, key=lambda msg: int(msg.get("messageTimestamp", 0)))
                        history_lines = []
                        for msg in sorted_messages[-20:]:
                            remetente = "Eu" if msg.get("key", {}).get("fromMe") else "Contato"
                            conteudo = (
                                msg.get("message", {}).get("extendedTextMessage", {}).get("text") or
                                msg.get("message", {}).get("conversation", "") or
                                "[Mídia ou mensagem não suportada]"
                            )
                            history_lines.append(f"- {remetente}: {conteudo}")
                        return "\n".join(history_lines)
            except Exception as e:
                error_details = getattr(e, 'response', str(e))
                if hasattr(error_details, 'text'):
                    error_details = error_details.text
                logger.error(f"Erro ao buscar histórico para a variação JID {jid}: {error_details}")
                continue # Tenta a próxima variação

        # 4. Se o loop terminar sem encontrar nada
        logger.warning(f"Nenhum histórico encontrado para o número {clean_number} em nenhuma variação.")
        return None


_whatsapp_service_instance = None
def get_whatsapp_service():
    global _whatsapp_service_instance
    if _whatsapp_service_instance is None:
        _whatsapp_service_instance = WhatsAppService()
    return _whatsapp_service_instance

