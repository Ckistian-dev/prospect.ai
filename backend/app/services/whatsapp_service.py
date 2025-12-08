import httpx
from app.core.config import settings
import logging
import json
from typing import Dict, Any, List, Optional
import base64
import asyncio

logger = logging.getLogger(__name__)

class MessageSendError(Exception):
    pass

class WhatsAppService:
    def __init__(self):
        self.api_url = settings.EVOLUTION_API_URL
        self.api_key = settings.EVOLUTION_API_KEY
        self.headers = {"apikey": self.api_key, "Content-Type": "application/json"}

    def _normalize_number(self, number: str) -> str:
        clean_number = "".join(filter(str.isdigit, str(number)))
        if len(clean_number) == 13 and clean_number.startswith("55"):
            subscriber_part = clean_number[4:]
            if subscriber_part.startswith('9'):
                return clean_number[:4] + subscriber_part[1:]
        return clean_number

    async def get_connection_status(self, instance_name: str) -> dict:
        """
        Verifica o status da conexão. Retorna 'connected' se a instância estiver 'open',
        caso contrário, retorna 'disconnected'.
        """
        if not instance_name:
            return {"status": "no_instance_name"}
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.api_url}/instance/connectionState/{instance_name}",
                    headers=self.headers,
                    timeout=10.0
                )
                response.raise_for_status()
                data = response.json()
                # Correção: O estado vem aninhado dentro do objeto 'instance'
                instance_data = data.get("instance", {})
                state = instance_data.get("state")
                if state in ["open", "connected"]:
                    return {"status": "connected", "instance": instance_data}
                return {"status": "disconnected", "instance": instance_data}
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                logger.warning(f"Instância '{instance_name}' não encontrada na Evolution API. Status: disconnected.")
                return {"status": "disconnected", "detail": "Instance not found"}
            logger.error(f"Erro de status HTTP ao checar status: {e.response.status_code} - {e.response.text}")
            return {"status": "disconnected", "detail": str(e)}
        except Exception as e:
            logger.error(f"Erro ao checar status: {e}")
            return {"status": "disconnected", "detail": str(e)}

    async def create_and_connect_instance(self, instance_name: str) -> dict:
        """
        Lógica de "Hard Reset": Deleta instância anterior, cria uma nova e obtém o QR Code.
        """
        try:
            await self.delete_instance(instance_name)
            await asyncio.sleep(2) # Pausa técnica para a Evolution processar

            async with httpx.AsyncClient(timeout=120.0) as client:
                # 2. CRIA A INSTÂNCIA NOVA
                create_payload = {
                    "instanceName": instance_name,
                    "qrcode": True,
                    "syncFullHistory": True,
                    "integration": "WHATSAPP-BAILEYS",
                    "webhook": {
                        "url": settings.WEBHOOK_URL, "enabled": True, "events": ["MESSAGES_UPSERT"]
                    }
                }
                
                # A chamada de criação já retorna o QR Code. Vamos capturar a resposta.
                create_response = await client.post(
                    f"{self.api_url}/instance/create",
                    json=create_payload,
                    headers=self.headers
                )
                create_response.raise_for_status()
                data = create_response.json()

                # Verifica se já conectou de cara (raro, mas possível)
                if data.get("instance", {}).get("state") == "open":
                    return {"status": "connected", "instance": data.get("instance")}

                # --- CORREÇÃO: Lidar com a resposta da API que pode não conter o base64 imediatamente ---
                # A API pode retornar o pairingCode sem o base64. Se isso acontecer, precisamos buscar o QR Code.
                qr_code_base64 = data.get("qrcode", {}).get("base64")
                
                if not qr_code_base64:
                    logger.info(f"Base64 do QR Code não veio na criação. Tentando obter via /connect para '{instance_name}'...")
                    await asyncio.sleep(3) # Pausa para a instância inicializar
                    connect_response = await client.get(
                        f"{self.api_url}/instance/connect/{instance_name}",
                        headers=self.headers,
                    )
                    connect_response.raise_for_status()
                    connect_data = connect_response.json()
                    qr_code_base64 = connect_data.get("base64")

                if qr_code_base64:
                     return {
                         "status": "qrcode", 
                         "instance": {
                             "id": data.get("instance", {}).get("instanceId"),
                             "instanceName": data.get("instance", {}).get("instanceName"),
                             "qrcode": qr_code_base64
                         }
                     }

                return {"status": "error", "detail": "Não foi possível gerar o QR Code após criar a instância."}

        except Exception as e:
            logger.error(f"Erro no fluxo de conexão forçada: {e}")
            return {"status": "error", "detail": str(e)}

    async def disconnect_instance(self, instance_name: str) -> dict:
        try:
            async with httpx.AsyncClient() as client:
                # Usamos delete para uma limpeza completa
                response = await client.delete(f"{self.api_url}/instance/delete/{instance_name}", headers=self.headers)
                # Mesmo que dê 404 (não encontrada), o objetivo foi alcançado.
                if response.status_code in [200, 204, 404]:
                    return {"status": "disconnected"}
                response.raise_for_status()
                return {"status": "disconnected"} # Sucesso
        except Exception as e:
            logger.error(f"Erro ao desconectar/deletar instância '{instance_name}': {e}")
            return {"status": "error", "detail": str(e)}

    async def delete_instance(self, instance_name: str) -> dict:
        """Deleta a instância. Silencioso, não levanta erro se a instância não existir."""
        logger.info(f"Tentando deletar instância '{instance_name}' para recomeçar...")
        await self.disconnect_instance(instance_name)
        return {"status": "deleted"}

    async def send_text_message(self, instance_name: str, number: str, text: str):
        normalized_number = self._normalize_number(number)
        # Rota correta da Evolution API para enviar texto
        url = f"{self.api_url}/message/sendText/{instance_name}"
        payload = {
            "number": normalized_number, # Número para receber a mensagem
            "text": text                 # O texto da mensagem
        }
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, headers=self.headers, json=payload, timeout=30.0)
                response.raise_for_status()
                logger.info(f"Mensagem enviada com sucesso para {normalized_number}.")
        except Exception as e:
            logger.error(f"Falha CRÍTICA ao enviar mensagem para {normalized_number}. Erro: {e}")
            raise MessageSendError(f"Falha no envio: {e}") from e

    async def get_media_and_convert(self, instance_name: str, message: dict) -> Optional[Dict[str, Any]]:
        """
        Obtém a mídia de uma mensagem da Evolution API em formato base64.
        Este método usa o endpoint getBase64FromMediaMessage para maior confiabilidade.
        """
        # 1. Extrair o ID da mensagem e o tipo de mídia
        message_key = message.get("key")
        msg_content = message.get("message", {})
        
        if not message_key or not message_key.get("id"):
            logger.error("Não foi possível encontrar o 'key.id' da mensagem para buscar a mídia.")
            return None

        message_id = message_key["id"]

        media_types = ["audioMessage", "imageMessage", "videoMessage", "documentMessage"]
        media_info = None
        media_type_key = None
        for media_type in media_types:
            if media_type in msg_content:
                media_info = msg_content[media_type]
                media_type_key = media_type
                break
        
        if not media_info:
            logger.warning("Nenhuma informação de mídia encontrada no objeto da mensagem.")
            return None

        mime_type = media_info.get("mimetype")
        if not mime_type:
            logger.warning(f"Não foi possível encontrar 'mimetype' no objeto de mídia: {media_info}")
            return None

        # 2. Montar o payload para a API
        url = f"{self.api_url}/chat/getBase64FromMediaMessage/{instance_name}"
        payload = {
            "message": {
                "key": {
                    "id": message_id
                }
            }
        }
        # Adiciona a conversão para MP4 se for um vídeo
        if media_type_key == "videoMessage":
            payload["convertToMp4"] = True

        # 3. Fazer a requisição para obter o base64
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, headers=self.headers, json=payload, timeout=60.0)
                response.raise_for_status()
                
                response_data = response.json()
                media_base64 = response_data.get("base64")

                if not media_base64:
                    logger.error(f"A API retornou sucesso mas não incluiu o 'base64' da mídia para a mensagem {message_id}.")
                    return None
                
                # 4. Retornar os dados no formato esperado pelo GeminiService
                # O GeminiService já sabe como lidar com base64 string.
                return {"mime_type": mime_type, "data": media_base64}

        except httpx.HTTPStatusError as e:
            logger.error(f"Falha de status HTTP ao buscar mídia em base64 para msg {message_id}: {e.response.status_code} - {e.response.text}", exc_info=True)
            return None
        except Exception as e:
            logger.error(f"Falha ao buscar mídia em base64 para msg {message_id}: {e}", exc_info=True)
            return None

    async def fetch_chat_history(self, instance_id: str, number: str, count: int = 999) -> List[Dict[str, Any]]:
        # A API EVOLUTION não expõe um banco de dados direto. O histórico é obtido via endpoint.
        normalized_number = self._normalize_number(number) + "@s.whatsapp.net"
        # Rota correta da Evolution API para buscar mensagens
        url = f"{self.api_url}/chat/findMessages/{instance_id}"
        # CORREÇÃO: O payload deve seguir a estrutura da documentação da Evolution API,
        # usando 'where' para filtrar pelo 'remoteJid'.
        payload = {
            "where": {
                "key": {"remoteJid": normalized_number}
            }
        }
        try:
            async with httpx.AsyncClient() as client:
                # A rota da Evolution usa POST para essa consulta
                response = await client.post(url, headers=self.headers, json=payload, timeout=60)
                response.raise_for_status()
                
                response_data = response.json()
                messages = []

                # CORREÇÃO 3: Lida com a nova estrutura aninhada {"messages": {"records": [...]}}
                # e mantém a retrocompatibilidade com os formatos anteriores.
                if isinstance(response_data, dict):
                    messages_obj = response_data.get("messages")
                    if isinstance(messages_obj, dict):
                        messages = messages_obj.get("records", []) # Formato mais novo
                    elif isinstance(messages_obj, list):
                        messages = messages_obj # Formato {"messages": [...]}
                    else:
                        messages = response_data.get("records", response_data) # Formato {"records": [...]} ou lista direta

                logger.info(f"Histórico para {number} carregado. Total de {len(messages if isinstance(messages, list) else [])} mensagens.")
                return messages
        except Exception as e:
            logger.error(f"Não foi possível buscar o histórico via API para {number}. Erro: {e}", exc_info=True)
            return []

    async def check_whatsapp_numbers(self, instance_name: str, numbers: List[str]) -> Optional[List[Dict[str, Any]]]:
        results = []
        # Rota correta da Evolution API para verificar números
        url = f"{self.api_url}/chat/whatsappNumbers/{instance_name}"
        payload = {
            "numbers": [self._normalize_number(n) for n in numbers]
        }
        try:
            async with httpx.AsyncClient() as client:
                # A rota da Evolution usa POST para essa verificação
                response = await client.post(url, headers=self.headers, json=payload, timeout=30)
                results = response.json()
            return results
        except Exception as e:
            logger.error(f"Falha ao verificar números no WhatsApp: {e}")
            return None

_whatsapp_service_instance = None
def get_whatsapp_service():
    global _whatsapp_service_instance
    if _whatsapp_service_instance is None:
        _whatsapp_service_instance = WhatsAppService()
    return _whatsapp_service_instance