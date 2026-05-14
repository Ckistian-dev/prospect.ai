import random
import httpx
from contextlib import asynccontextmanager
from app.core.config import settings
import logging
import json
from typing import Dict, Any, List, Optional
from datetime import datetime
import base64
import asyncio
import asyncpg
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import models

logger = logging.getLogger(__name__)

class MessageSendError(Exception):
    pass

class WhatsAppService:
    def __init__(self, api_url: str = settings.EVOLUTION_API_URL, api_key: str = settings.EVOLUTION_API_KEY, db_url: Optional[str] = getattr(settings, "EVOLUTION_DATABASE_URL", None)):
        self.api_url = api_url.rstrip("/")
        self.api_key = api_key
        self.db_url = db_url
        self.headers = {
            "apikey": self.api_key,
            "Content-Type": "application/json"
        }

    @asynccontextmanager
    async def get_evolution_db_connection(self):
        """Context manager para conexões com o banco da Evolution."""
        if not self.db_url:
            raise ValueError("EVOLUTION_DATABASE_URL não configurada.")
        
        # Converte a URL para o formato asyncpg se necessário
        db_url = self.db_url.replace("postgresql+asyncpg://", "postgresql://")
        conn = await asyncpg.connect(db_url)
        try:
            yield conn
        finally:
            await conn.close()

    def _normalize_number(self, number: str) -> str:
        clean_number = "".join(filter(str.isdigit, str(number)))
        if not clean_number.startswith("55") and len(clean_number) in [10, 11]:
            clean_number = "55" + clean_number
        if len(clean_number) == 13 and clean_number.startswith("55"):
            if clean_number[4] == '9':
                return clean_number[:4] + clean_number[5:]
        return clean_number

    async def fetch_instance(self, instance_name: str) -> dict:
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.api_url}/instance/fetchInstances",
                    headers=self.headers,
                    params={"instanceName": instance_name},
                    timeout=10.0
                )
                response.raise_for_status()
                data = response.json()
                if isinstance(data, list) and len(data) > 0:
                    item = data[0]
                    if "instance" in item:
                        return item.get("instance", {})
                    return item
                return {}
        except Exception as e:
            logger.error(f"Erro ao buscar instância '{instance_name}': {e}")
            return {}

    async def get_connection_status(self, instance_name: str) -> dict:
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

    async def create_and_connect_instance(self, instance_name: str, instance_model=None) -> dict:
        try:
            await self.delete_instance(instance_name)
            await asyncio.sleep(2)
            async with httpx.AsyncClient(timeout=120.0) as client:
                create_payload = {
                    "instanceName": instance_name,
                    "qrcode": True,
                    "syncFullHistory": True,
                    "integration": "WHATSAPP-BAILEYS",
                    "webhook": {
                        "url": settings.WEBHOOK_URL, "enabled": True, "events": ["MESSAGES_UPSERT"]
                    }
                }
                if instance_model and getattr(instance_model, "proxy_host", None):
                    create_payload["proxyHost"] = instance_model.proxy_host
                    if getattr(instance_model, "proxy_port", None):
                        create_payload["proxyPort"] = str(instance_model.proxy_port)
                    if getattr(instance_model, "proxy_protocol", None):
                        create_payload["proxyProtocol"] = instance_model.proxy_protocol
                    if getattr(instance_model, "proxy_username", None):
                        create_payload["proxyUsername"] = instance_model.proxy_username
                    if getattr(instance_model, "proxy_password", None):
                        create_payload["proxyPassword"] = instance_model.proxy_password
                create_response = await client.post(
                    f"{self.api_url}/instance/create",
                    json=create_payload,
                    headers=self.headers,
                    timeout=60.0
                )
                create_response.raise_for_status()
                data = create_response.json()
                if data.get("instance", {}).get("state") == "open":
                    return {"status": "connected", "instance": data.get("instance")}
                qr_code_base64 = data.get("qrcode", {}).get("base64")
                if not qr_code_base64:
                    logger.info(f"Base64 do QR Code não veio na criação. Tentando obter via /connect para '{instance_name}'...")
                    await asyncio.sleep(60)
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
                response = await client.delete(f"{self.api_url}/instance/delete/{instance_name}", headers=self.headers)
                if response.status_code in [200, 204, 404]:
                    return {"status": "disconnected"}
                response.raise_for_status()
                return {"status": "disconnected"}
        except Exception as e:
            logger.error(f"Erro ao desconectar/deletar instância '{instance_name}': {e}")
            return {"status": "error", "detail": str(e)}

    async def delete_instance(self, instance_name: str) -> dict:
        logger.info(f"Tentando deletar instância '{instance_name}' para recomeçar...")
        await self.disconnect_instance(instance_name)
        return {"status": "deleted"}

    async def send_text_message(self, instance_name: str, number: str, text: str):
        if "@" in number:
            normalized_number = number
        else:
            normalized_number = self._normalize_number(number)
        url = f"{self.api_url}/message/sendText/{instance_name}"
        payload = {"number": normalized_number, "text": text}
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, headers=self.headers, json=payload, timeout=30.0)
                response.raise_for_status()
                logger.info(f"Mensagem enviada com sucesso para {normalized_number}.")
                return response.json()
        except Exception as e:
            logger.error(f"Falha CRÍTICA ao enviar mensagem para {normalized_number}. Erro: {e}")
            raise MessageSendError(f"Falha no envio: {e}") from e

    async def send_media_message(self, instance_name: str, number: str, media: str, media_type: str, mime_type: str, caption: str = "", file_name: str = "arquivo", delay: int = 0):
        if "@" in number:
            normalized_number = number
        else:
            normalized_number = self._normalize_number(number)
        url = f"{self.api_url}/message/sendMedia/{instance_name}"
        payload = {
            "number": normalized_number,
            "media": media,
            "mediaType": media_type,
            "mimeType": mime_type,
            "fileName": file_name,
            "caption": caption,
            "delay": delay
        }
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, headers=self.headers, json=payload, timeout=120.0)
                response.raise_for_status()
                logger.info(f"Mídia enviada com sucesso para {normalized_number}.")
                return response.json()
        except Exception as e:
            logger.error(f"Falha ao enviar mídia para {normalized_number}. Erro: {e}")
            raise MessageSendError(f"Falha no envio de mídia: {e}") from e

    async def send_whatsapp_audio(self, instance_name: str, number: str, audio_base64: str, delay: int = 0):
        if "@" in number:
            normalized_number = number
        else:
            normalized_number = self._normalize_number(number)
        url = f"{self.api_url}/message/sendWhatsAppAudio/{instance_name}"
        payload = {"number": normalized_number, "audio": audio_base64, "delay": delay}
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, headers=self.headers, json=payload, timeout=60.0)
                response.raise_for_status()
                logger.info(f"Áudio enviado com sucesso para {normalized_number}.")
                return response.json()
        except Exception as e:
            logger.error(f"Falha ao enviar áudio para {normalized_number}. Erro: {e}")
            raise MessageSendError(f"Falha no envio de áudio: {e}") from e

    async def send_reaction(self, instance_name: str, number: str, message_id: str, emoji: str):
        normalized_number = self._normalize_number(number)
        url = f"{self.api_url}/message/sendReaction/{instance_name}"
        payload = {
            "number": normalized_number,
            "reactionMessage": {"key": {"id": message_id, "fromMe": False}, "text": emoji}
        }
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, headers=self.headers, json=payload, timeout=10.0)
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.warning(f"Falha ao enviar reação {emoji} para {normalized_number}: {e}")

    async def get_media_and_convert(self, instance_name: str, message: dict) -> Optional[Dict[str, Any]]:
        message_key = message.get("key")
        msg_content = message.get("message", {})
        if not message_key or not message_key.get("id"): return None
        message_id = message_key["id"]
        media_types = ["audioMessage", "imageMessage", "videoMessage", "documentMessage", "stickerMessage"]
        media_info = None
        media_type_key = None
        for media_type in media_types:
            if media_type in msg_content:
                media_info = msg_content[media_type]
                media_type_key = media_type
                break
        if not media_info: return None
        mime_type = media_info.get("mimetype")
        if not mime_type: return None
        url = f"{self.api_url}/chat/getBase64FromMediaMessage/{instance_name}"
        payload = {"message": {"key": {"id": message_id}}, "convertToMp4": True if media_type_key == "videoMessage" else False}
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, headers=self.headers, json=payload, timeout=60.0)
                response.raise_for_status()
                response_data = response.json()
                media_base64 = response_data.get("base64")
                if not media_base64: return None
                return {"mime_type": response_data.get("mimetype") or mime_type, "data": media_base64}
        except Exception as e:
            logger.error(f"Falha ao buscar mídia em base64 para msg {message_id}: {e}")
            return None

    async def get_media_by_message_id(self, instance_name: str, message_id: str) -> Optional[Dict[str, Any]]:
        url = f"{self.api_url}/chat/getBase64FromMediaMessage/{instance_name}"
        payload = {"message": {"key": {"id": message_id}}, "convertToMp4": True}
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, headers=self.headers, json=payload, timeout=60.0)
                response.raise_for_status()
                data = response.json()
                return {"base64": data.get("base64"), "mimetype": data.get("mimetype")}
        except Exception as e:
            logger.error(f"Falha ao buscar mídia por ID {message_id}: {e}")
            return None

    async def fetch_chats(self, evolution_instance_id: str, limit: int = 100, offset: int = 0, db: Optional[AsyncSession] = None, user_id: Optional[int] = None) -> List[Dict[str, Any]]:
        if not self.db_url:
            logger.error("EVOLUTION_DATABASE_URL não configurada.")
            return []
        return await self._fetch_chats_postgresql(evolution_instance_id, limit, offset, db, user_id)

    async def fetch_chat_history(self, instance_name: str, number: str, count: int = 999, mode: str = None, jids: List[str] = None, evolution_instance_id: Optional[str] = None, start_date: Optional[datetime] = None, end_date: Optional[datetime] = None, format: bool = True) -> List[Dict[str, Any]]:
        """
        Busca o histórico de mensagens diretamente do banco de dados da Evolution.
        Suporta filtragem por data.
        """
        if not self.db_url:
            logger.error("EVOLUTION_DATABASE_URL não configurada.")
            return []
            
        try:
            # Resolve todos os JIDs possíveis primeiro para busca no DB
            if not jids and number:
                jids = await self.get_all_jids_for_contact(number)
            
            return await self._fetch_history_postgresql(
                instance_name, number, count, mode, jids, evolution_instance_id, 
                start_date=start_date, end_date=end_date, format=format
            )
        except Exception as e:
            logger.error(f"Erro ao buscar histórico via DB: {e}")
            return []


    async def _fetch_chats_postgresql(self, evolution_instance_id: str, limit: int = 100, offset: int = 0, db: Optional[AsyncSession] = None, user_id: Optional[int] = None) -> List[Dict[str, Any]]:
        if not self.db_url: return []
        try:
            db_url = self.db_url.replace("postgresql+asyncpg://", "postgresql://")
            conn = await asyncpg.connect(db_url)
            try:
                # Query otimizada para performance e consolidação agressiva
                query = """
                WITH raw_contacts AS (
                    SELECT 
                        c."remoteJid",
                        c."pushName",
                        ch.name as "chatName",
                        ch."unreadMessages",
                        c."profilePicUrl",
                        c."updatedAt",
                        iso."lid",
                        iso."remoteJid" as "isoRemoteJid",
                        -- Chave de agrupamento: Prioriza IsOnWhatsapp (JID ou LID), depois Foto, depois JID normalizado
                        COALESCE(
                            iso."remoteJid", 
                            iso."lid",
                            CASE 
                                WHEN c."remoteJid" NOT LIKE '%@g.us' AND c."profilePicUrl" IS NOT NULL 
                                THEN 'pic:' || regexp_replace(c."profilePicUrl", '\\?.*', '') -- Remove tokens da URL da imagem
                                WHEN c."remoteJid" LIKE '55%@s.whatsapp.net' OR c."remoteJid" LIKE '55%@c.us'
                                THEN 
                                    CASE 
                                        WHEN length(regexp_replace(c."remoteJid", '[^0-9]', '', 'g')) = 13 
                                             AND substr(regexp_replace(c."remoteJid", '[^0-9]', '', 'g'), 5, 1) = '9'
                                        THEN substr(regexp_replace(c."remoteJid", '[^0-9]', '', 'g'), 1, 4) || substr(regexp_replace(c."remoteJid", '[^0-9]', '', 'g'), 6) || '@s.whatsapp.net'
                                        ELSE regexp_replace(c."remoteJid", '[^0-9]', '', 'g') || '@s.whatsapp.net'
                                    END
                                ELSE c."remoteJid" 
                            END
                        ) as group_key
                    FROM "Contact" c
                    LEFT JOIN "Chat" ch ON ch."remoteJid" = c."remoteJid" AND ch."instanceId" = c."instanceId"
                    LEFT JOIN "IsOnWhatsapp" iso ON (iso."remoteJid" = c."remoteJid" OR iso."lid" = c."remoteJid")
                    WHERE c."instanceId" = $1
                ),
                consolidated AS (
                    SELECT DISTINCT ON (group_key)
                        group_key,
                        "remoteJid",
                        "pushName",
                        "chatName",
                        "profilePicUrl",
                        "updatedAt",
                        "lid",
                        "isoRemoteJid",
                        SUM(COALESCE("unreadMessages", 0)) OVER (PARTITION BY group_key) as "unreadCount",
                        array_agg("remoteJid") OVER (PARTITION BY group_key) as all_jids
                    FROM raw_contacts
                    ORDER BY group_key, "pushName" IS NULL, "updatedAt" DESC
                ),
                -- Pega as últimas 1000 mensagens da instância para buscar conteúdo de forma eficiente
                latest_msgs AS (
                    SELECT 
                        "key"->>'remoteJid' as msg_jid,
                        "message",
                        "key",
                        "status",
                        "messageTimestamp"
                    FROM "Message"
                    WHERE "instanceId" = $1
                    ORDER BY "messageTimestamp" DESC
                    LIMIT 1000
                ),
                -- Pega a mais recente para cada chat consolidado (se houver nos últimos 1000)
                chat_latest_msgs AS (
                    SELECT DISTINCT ON (c.group_key)
                        c.group_key,
                        lm.message,
                        lm.key,
                        lm.status,
                        lm."messageTimestamp"
                    FROM consolidated c
                    JOIN latest_msgs lm ON lm.msg_jid = ANY(c.all_jids)
                    ORDER BY c.group_key, lm."messageTimestamp" DESC
                )
                SELECT 
                    c.*,
                    lm.message,
                    lm.key,
                    lm.status,
                    lm."messageTimestamp"
                FROM consolidated c
                LEFT JOIN chat_latest_msgs lm ON lm.group_key = c.group_key
                ORDER BY COALESCE(lm."messageTimestamp", 0) DESC, c."updatedAt" DESC
                LIMIT $2 OFFSET $3
                """
                rows = await conn.fetch(query, evolution_instance_id, limit, offset)
                
                chats = []
                for row in rows:
                    msg_obj = json.loads(row["message"]) if isinstance(row["message"], str) else row["message"]
                    key_obj = json.loads(row["key"]) if isinstance(row["key"], str) else row["key"]
                    remote_jid = row["remoteJid"]
                    lid = row["lid"]
                    
                    # Prioriza o melhor nome disponível (Nome do Chat/Grupo > PushName > JID)
                    display_name = row["chatName"] or row["pushName"] or remote_jid.split("@")[0]
                    
                    content = ""
                    if msg_obj:
                        # Reutiliza a lógica de formatação para consistência
                        temp_formatted = self.format_evolution_message({"message": msg_obj, "key": key_obj, "messageTimestamp": row["messageTimestamp"]})
                        content = temp_formatted.get("content", "")
                    
                    if row["messageTimestamp"]:
                        chats.append({
                            "id": remote_jid,
                            "remoteJid": remote_jid,
                            "lid": lid,
                            "name": display_name,
                            "profilePicUrl": row["profilePicUrl"],
                            "isGroup": "@g.us" in remote_jid,
                            "lastMessage": content,
                            "timestamp": row["messageTimestamp"],
                            "status": row["status"],
                            "fromMe": key_obj.get("fromMe", False) if key_obj else False,
                            "lastMessageSender": remote_jid,
                            "unreadCount": row["unreadCount"] or 0
                        })
                
                if db and user_id: await self._correlate_chats_with_prospects(chats, db, user_id)
                return chats
            finally:
                await conn.close()
        except Exception as e:
            logger.error(f"Erro ao buscar chats via PostgreSQL: {e}", exc_info=True)
            return []

    async def _correlate_chats_with_prospects(self, chats: List[Dict[str, Any]], db: AsyncSession, user_id: int):
        stmt = select(models.ProspectContact, models.Prospect.nome_prospeccao, models.Contact.whatsapp).join(models.Prospect, models.ProspectContact.prospect_id == models.Prospect.id).join(models.Contact, models.ProspectContact.contact_id == models.Contact.id).where(models.Prospect.user_id == user_id)
        result = await db.execute(stmt)
        prospect_contacts = result.all()
        jid_map = {}
        for pc, campaign_name, whatsapp in prospect_contacts:
            data = {"situacao": pc.situacao, "campanha": campaign_name, "prospect_contact_id": pc.id, "observacoes": pc.observacoes}
            standard_jid = f"{self._normalize_number(whatsapp)}@s.whatsapp.net"
            if standard_jid not in jid_map: jid_map[standard_jid] = data
            if pc.jid_options:
                for jid in [j.strip() for j in pc.jid_options.split(',') if j.strip()]:
                    if jid not in jid_map: jid_map[jid] = data
        for chat in chats:
            match = jid_map.get(chat["remoteJid"])
            if match:
                chat.update({"situacao": match["situacao"], "campanha": match["campanha"], "prospect_contact_id": match["prospect_contact_id"], "observacoes": match["observacoes"]})

    def format_evolution_message(self, raw_msg: Any) -> Dict[str, Any]:
        # Inicialização de segurança para evitar NameError
        timestamp = 0
        buttons = []
        extra_data = {}
        content = ""
        msg_type = "text"
        role = "user"
        participant = None
        
        try:
            if isinstance(raw_msg, str): raw_msg = json.loads(raw_msg)
            
            # LOG DE DEPURAÇÃO: Início do processamento
            msg_id_log = raw_msg.get("key", {}).get("id", "no-id")

            # 1. Metadados básicos
            key = raw_msg.get("key", {})
            timestamp = raw_msg.get("messageTimestamp") or 0
            msg_content = raw_msg.get("message") or {}

            buttons = []
            extra_data = {}

            if isinstance(msg_content, dict):
                # 1. Desembrulhar mensagens aninhadas (Recursivo ou Loop)
                temp_msg = msg_content
                found_real_msg = False
                wrappers = ["ephemeralMessage", "viewOnceMessage", "viewOnceMessageV2", "documentWithCaptionMessage", "protocolMessage", "editedMessage", "message"]
                
                for _ in range(5):
                    if not isinstance(temp_msg, dict): break
                    found_wrap = False
                    for wrap in wrappers:
                        if wrap in temp_msg:
                            val = temp_msg[wrap]
                            if isinstance(val, dict):
                                if wrap == "protocolMessage" and "editedMessage" in val:
                                    temp_msg = val["editedMessage"]
                                elif "message" in val and isinstance(val["message"], dict):
                                    temp_msg = val["message"]
                                else:
                                    temp_msg = val
                                found_real_msg = True
                                found_wrap = True
                                break
                    if not found_wrap:
                        break
                
                if found_real_msg:
                    msg_content = temp_msg


                # 2. Extrair conteúdo e tipo
                raw_type = raw_msg.get("messageType") or ""
                
                # Se for um tipo puramente técnico/sistema do WhatsApp, ignoramos
                technical_types = ["senderKeyDistributionMessage", "peerDataOperationRequestMessage", "clientExpirationMessage", "accountSyncReceiptMessage"]
                if raw_type in technical_types:
                    logger.info(f"[Evolution] Ignorando mensagem do tipo técnico: {raw_type}")
                    return {"id": msg_id_log, "role": "system", "content": "", "type": "technical", "timestamp": timestamp}

                msg_type = raw_type.replace("Message", "").lower() if raw_type else "text"
                if msg_type == "conversation": msg_type = "text"
                if msg_type == "extendedtext": msg_type = "text"
                
                # Extração de botões (comum em fluxos de IA e marketing)
                if "buttonsMessage" in msg_content:
                    for btn in msg_content["buttonsMessage"].get("buttons", []):
                        buttons.append(btn.get("buttonText", {}).get("displayText", ""))
                elif "templateMessage" in msg_content:
                    h_template = msg_content["templateMessage"].get("hydratedTemplate", {}) or msg_content["templateMessage"].get("hydratedFourRowTemplate", {})
                    if h_template:
                        for btn in h_template.get("hydratedButtons", []):
                            for k in ["quickReplyButton", "urlButton", "callButton"]:
                                if k in btn:
                                    buttons.append(btn[k].get("displayText", ""))
                elif "interactiveMessage" in msg_content:
                    # Botões de mensagens interativas (Evolution API)
                    # Se houver botões simples
                    for btn in msg_content["interactiveMessage"].get("buttons", []):
                        buttons.append(btn.get("buttonText", {}).get("displayText", ""))
                    # Se houver native flow
                    native = msg_content["interactiveMessage"].get("nativeFlowMessage", {})
                    for btn in native.get("buttons", []):
                        if "displayText" in btn:
                            buttons.append(btn["displayText"])

                # Tenta extrair texto de TODAS as fontes possíveis
                content = (
                    msg_content.get("conversation") or 
                    msg_content.get("text") or
                    msg_content.get("extendedTextMessage", {}).get("text") or 
                    msg_content.get("contentText") or
                    msg_content.get("caption") or 
                    msg_content.get("textMessage") or
                    # Suporte para interactiveMessage (Botões/CTA)
                    msg_content.get("interactiveMessage", {}).get("body", {}).get("text") or
                    # Suporte para templateMessage (Mensagens do sistema/marketing)
                    msg_content.get("templateMessage", {}).get("hydratedTemplate", {}).get("hydratedContentText") or
                    msg_content.get("templateMessage", {}).get("hydratedFourRowTemplate", {}).get("hydratedContentText") or
                    ""
                )

                # Se for um objeto com chave 'message' (caso não pego pelo unwrapper)
                if not content and "message" in msg_content and isinstance(msg_content["message"], dict):
                    inner = msg_content["message"]
                    content = inner.get("conversation") or inner.get("text") or inner.get("extendedTextMessage", {}).get("text") or ""

                # Identifica mídias e extrai legendas/metadados
                for t in ["image", "video", "audio", "sticker", "document"]:
                    key_name = f"{t}Message"
                    if key_name in msg_content:
                        msg_type = t
                        media_obj = msg_content[key_name]
                        extra_data = {
                            "media_id": key.get("id"), 
                            "mime_type": media_obj.get("mimetype"),
                            "caption": media_obj.get("caption"),
                            "filename": media_obj.get("fileName") or media_obj.get("filename")
                        }
                        if not content:
                            content = extra_data["caption"] or f"[{t.capitalize()}]"
                        break
                
                # Casos especiais e Respostas (Interações)
                if not content:
                    if "buttonsResponseMessage" in msg_content:
                        content = msg_content["buttonsResponseMessage"].get("selectedDisplayText") or "[Botão clicado]"
                        msg_type = "buttons_response"
                    elif "templateButtonReplyMessage" in msg_content:
                        content = msg_content["templateButtonReplyMessage"].get("selectedDisplayText") or "[Botão clicado]"
                        msg_type = "buttons_response"
                    elif "listResponseMessage" in msg_content:
                        content = msg_content["listResponseMessage"].get("title") or "[Item de lista selecionado]"
                        msg_type = "list_response"
                    elif "pollCreationMessage" in msg_content or "pollCreationMessageV2" in msg_content or "pollCreationMessageV3" in msg_content:
                        poll = msg_content.get("pollCreationMessage") or msg_content.get("pollCreationMessageV2") or msg_content.get("pollCreationMessageV3")
                        content = f"Enquete: {poll.get('name', '')}"
                        msg_type = "poll"
                    elif "pollUpdateMessage" in msg_content:
                        vote = msg_content["pollUpdateMessage"].get("vote", {})
                        options = vote.get("selectedOptions", [])
                        content = f"[Voto: {', '.join(options)}]" if options else "[Voto em enquete]"
                        msg_type = "poll_update"
                    elif "reactionMessage" in msg_content:
                        msg_type = "reaction"
                        reaction_obj = msg_content['reactionMessage']
                        content = f"Reagiu: {reaction_obj.get('text')}"
                        extra_data["target_message_id"] = reaction_obj.get("key", {}).get("id")
                        extra_data["reaction_text"] = reaction_obj.get("text")
                    elif "protocolMessage" in msg_content:
                        msg_type = "protocol"
                        content = "[Mensagem de Sistema/Apagada]"
                    elif "contactMessage" in msg_content:
                        msg_type = "contact"
                        content = f"Contato: {msg_content['contactMessage'].get('displayName')}"
                    elif "contactsArrayMessage" in msg_content:
                        msg_type = "contact"
                        content = "[Contatos]"
                    elif "locationMessage" in msg_content or "liveLocationMessage" in msg_content:
                        msg_type = "location"
                        content = "[Localização]"
                    elif "interactiveMessage" in msg_content:
                        # Fallback para interactiveMessage se não pegou body.text acima
                        content = "[Mensagem Interativa]"
                
                # Fallback final: se ainda estiver vazio, não preenchemos o content para permitir filtragem
                if not content:
                    if msg_type != "text":
                        content = f"[{msg_type.replace('Message', '').capitalize()}]"
                    else:
                        content = ""
            else:
                content = str(msg_content) if msg_content else ""

            # 3. Determinar papel (role)
            from_me = key.get("fromMe")
            if isinstance(from_me, str):
                from_me = from_me.lower() == "true"
            
            role = "assistant" if from_me else "user"
            participant = key.get("participant") or raw_msg.get("participant")
            
            # 4. Fallback de ID para evitar erros no React (Warning: same key)
            msg_id = key.get("id") or f"gen-{timestamp}-{hash(content or '')}-{random.randint(1000, 9999)}"


            return {
                "id": msg_id,
                "role": role,
                "senderName": raw_msg.get("pushName"),
                "senderPhoto": raw_msg.get("senderPhoto"),
                "participant": participant,
                "content": content,
                "type": msg_type,
                "timestamp": timestamp,
                "status": "read" if raw_msg.get("status") in ["READ", "PLAYED", "3"] else "unread",
                "buttons": buttons,
                **extra_data  # Espalha media_id, caption, filename, etc na raiz
            }
        except Exception as e:
            logger.error(f"Erro ao formatar mensagem da Evolution: {e}", exc_info=True)
            return {"id": f"error-{id(raw_msg)}", "role": "system", "content": f"[Erro de Formatação: {str(e)}]", "type": "text", "timestamp": 0}

    async def _fetch_history_postgresql(self, instance_name: str, number: str, count: int = 999, mode: str = None, jids: List[str] = None, evolution_instance_id: Optional[str] = None, start_date: Optional[datetime] = None, end_date: Optional[datetime] = None, format: bool = True) -> List[Dict[str, Any]]:
        try:
            db_url = self.db_url.replace("postgresql+asyncpg://", "postgresql://")
            conn = await asyncpg.connect(db_url)
            try:
                instance_id = evolution_instance_id or await conn.fetchval('SELECT id FROM "Instance" WHERE name = $1', instance_name)
                if not instance_id:
                    logger.error(f"Instância '{instance_name}' não encontrada no banco da Evolution.")
                    return []

                # 1. Resolver JIDs se não fornecidos
                all_target_jids = set(jids) if jids else set()
                if not all_target_jids and number:
                    resolved_jids = await self.get_all_jids_for_contact(number)
                    all_target_jids.update(resolved_jids)
                
                # Garante que temos pelo menos o JID padrão baseado no número
                if not all_target_jids and number:
                    clean_num = "".join(filter(str.isdigit, str(number)))
                    all_target_jids.add(f"{clean_num}@s.whatsapp.net")

                all_target_jids = [j for j in all_target_jids if j]

                # 2. Prepara filtros de data
                start_ts = int(start_date.timestamp()) if start_date else None
                end_ts = int(end_date.timestamp()) if end_date else None
                
                date_filter = ""
                params_idx = 4
                query_params = []
                
                if start_ts:
                    date_filter += f' AND "messageTimestamp" >= ${params_idx}'
                    query_params.append(start_ts)
                    params_idx += 1
                if end_ts:
                    date_filter += f' AND "messageTimestamp" <= ${params_idx}'
                    query_params.append(end_ts)
                    params_idx += 1

                # 3. Buscar mensagens
                query = f"""
                    SELECT m."key", m."message", m."messageTimestamp", m."pushName", m."status", m."messageType", m."contextInfo",
                           c."profilePicUrl" as "senderPhoto"
                    FROM "Message" m
                    LEFT JOIN "Contact" c ON (
                        c."remoteJid" = COALESCE(m."key"->>'participant', m."key"->>'remoteJid')
                        AND c."instanceId" = m."instanceId"
                    )
                    WHERE m."instanceId" = $1
                      AND (
                        m."key"->>'remoteJid' = ANY($2::text[])
                        OR m."key"->>'remoteJidAlt' = ANY($2::text[])
                      )
                      {date_filter}
                    ORDER BY m."messageTimestamp" DESC
                    LIMIT $3
                """

                logger.info(f"[Evolution DB] Buscando histórico para JIDs: {all_target_jids}")
                rows = await conn.fetch(query, instance_id, all_target_jids, count, *query_params)
                logger.info(f"[Evolution DB] Query retornou {len(rows)} linhas.")
                
                messages = []
                for i, row in enumerate(rows):
                    raw_msg = {
                        "key": json.loads(row["key"]) if isinstance(row["key"], str) else row["key"],
                        "message": json.loads(row["message"]) if isinstance(row["message"], str) else row["message"],
                        "messageTimestamp": row["messageTimestamp"],
                        "pushName": row["pushName"],
                        "status": row["status"],
                        "messageType": row["messageType"],
                        "contextInfo": json.loads(row["contextInfo"]) if isinstance(row["contextInfo"], str) else row["contextInfo"],
                        "senderPhoto": row["senderPhoto"]
                    }
                    
                    formatted = self.format_evolution_message(raw_msg)
                    
                    # Filtra mensagens técnicas ou totalmente vazias que não devem poluir a UI
                    if formatted.get("type") == "technical" or (not formatted.get("content") and not formatted.get("media_id")):
                        continue
                        
                    messages.append(formatted if format else raw_msg)
                
                if not messages and mode and mode != 'initial':
                    logger.warning(f"Histórico vazio para JIDs {all_target_jids} em modo '{mode}'.")

                logger.info(f"Histórico carregado via DB para {number}. Total: {len(messages)} mensagens.")
                return messages
            finally:
                await conn.close()
        except Exception as e:
            logger.error(f"Erro ao buscar histórico no banco de dados da Evolution: {e}", exc_info=True)
            return []

    async def find_lid_by_message_content(self, instance_name: str, content: str) -> Optional[str]:
        """
        Busca uma mensagem enviada pela IA no banco da Evolution para tentar descobrir o LID.
        Retorna o remoteJid se for um LID e se a mensagem for única.
        """
        if not self.db_url:
            return None

        try:
            # Remove o prefixo '+asyncpg' se presente, pois o driver asyncpg puro não o reconhece
            db_url = self.db_url.replace("postgresql+asyncpg://", "postgresql://")
            
            conn = await asyncpg.connect(db_url)
            try:
                # Busca mensagens enviadas pela instância (fromMe=true) com o conteúdo exato
                # Retorna remoteJid
                query = """
                    SELECT "key"->>'remoteJid' as remote_jid
                    FROM "Message"
                    WHERE "instanceId" = (SELECT id FROM "Instance" WHERE name = $1)
                      AND "key"->>'fromMe' = 'true'
                      AND (
                          "message"->>'conversation' = $2
                          OR "message"->'extendedTextMessage'->>'text' = $2
                      )
                    LIMIT 2
                """
                rows = await conn.fetch(query, instance_name, content)
                
                # Se retornar mais de 1, é ambíguo, pula.
                if len(rows) != 1:
                    return None
                
                remote_jid = rows[0]['remote_jid']
                if remote_jid and '@lid' in remote_jid:
                    return remote_jid
                
                return None
            finally:
                await conn.close()
        except Exception as e:
            logger.error(f"Erro ao buscar LID por conteúdo: {e}")
            return None

    async def find_contacts(self, instance_name: str) -> List[Dict[str, Any]]:
        """Busca contatos na Evolution API."""
        url = f"{self.api_url}/chat/findContacts/{instance_name}"
        payload = {"where": {}}
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, headers=self.headers, json=payload, timeout=30.0)
                response.raise_for_status()
                data = response.json()
                return data if isinstance(data, list) else []
        except Exception as e:
            logger.error(f"Erro ao buscar contatos: {e}")
            return []

    async def fetch_contacts_from_db(self, evolution_instance_id: str, limit: int = 1000) -> List[Dict[str, Any]]:
        """Busca contatos sincronizados diretamente do banco de dados da Evolution."""
        if not self.db_url: return []
        try:
            db_url = self.db_url.replace("postgresql+asyncpg://", "postgresql://")
            conn = await asyncpg.connect(db_url)
            try:
                query = 'SELECT "remoteJid", "pushName" as name, "profilePicUrl" FROM "Contact" WHERE "instanceId" = $1 ORDER BY "pushName" ASC LIMIT $2'
                rows = await conn.fetch(query, evolution_instance_id, limit)
                
                result = []
                for row in rows:
                    remote_jid = row["remoteJid"]
                    result.append({
                        "remoteJid": remote_jid,
                        "name": row["name"] or remote_jid.split("@")[0],
                        "profilePicUrl": row["profilePicUrl"],
                        "isGroup": "@g.us" in remote_jid
                    })
                return result
            finally:
                await conn.close()
        except Exception as e:
            logger.error(f"Erro ao buscar contatos via DB: {e}")
            return []

    async def fetch_contacts_from_api(self, instance_name: str, db: Optional[AsyncSession] = None, user_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Busca contatos diretamente na Evolution API usando POST /chat/findContacts.
        Retorna a lista de contatos normalizada para o frontend e correlacionada com o DB local.
        """
        url = f"{self.api_url}/chat/findContacts/{instance_name}"
        payload = {"where": {}}
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, headers=self.headers, json=payload)
                response.raise_for_status()
                data = response.json()
                logger.info(f"[WhatsAppService] findContacts Raw Response: {str(data)[:500]}...")
                
                # Trata diferentes estruturas de retorno da Evolution
                contacts_raw = []
                if isinstance(data, list):
                    contacts_raw = data
                elif isinstance(data, dict):
                    contacts_raw = data.get("records", data.get("contacts", data.get("messages", [])))
                
                logger.info(f"[WhatsAppService] fetch_contacts_from_api: Recebidos {len(contacts_raw)} contatos crus da Evolution")
                
                result = []
                for c in contacts_raw:
                    # Prioriza campos que costumam conter o JID real do WhatsApp
                    remote_jid = c.get("remoteJid", "") or c.get("jid", "") or c.get("id", "")
                    
                    if not remote_jid:
                        continue
                        
                    # Log para depurar o que está chegando
                    # logger.debug(f"Processando contato: {remote_jid}")
                    
                    result.append({
                        "remoteJid": remote_jid,
                        "name": c.get("pushName") or c.get("name") or remote_jid.split("@")[0],
                        "profilePicUrl": c.get("profilePicUrl") or c.get("profilePictureUrl"),
                        "isGroup": "@g.us" in remote_jid,
                    })

                # Correlaciona com o banco do ProspectAI se db e user_id forem fornecidos
                if db and user_id and result:
                    stmt = (
                        select(models.ProspectContact, models.Prospect.nome_prospeccao, models.Contact.whatsapp)
                        .join(models.Prospect, models.ProspectContact.prospect_id == models.Prospect.id)
                        .join(models.Contact, models.ProspectContact.contact_id == models.Contact.id)
                        .where(models.Prospect.user_id == user_id)
                    )
                    db_res = await db.execute(stmt)
                    prospect_contacts = db_res.all()

                    jid_map = {}
                    for pc, campaign_name, whatsapp in prospect_contacts:
                        normalized = self._normalize_number(whatsapp)
                        standard_jid = f"{normalized}@s.whatsapp.net"
                        correlation_data = {
                            "situacao": pc.situacao,
                            "campanha": campaign_name,
                            "prospect_contact_id": pc.id,
                            "observacoes": pc.observacoes
                        }
                        jid_map[standard_jid] = correlation_data
                        if pc.jid_options:
                            for jid in [j.strip() for j in pc.jid_options.split(',') if j.strip()]:
                                jid_map[jid] = correlation_data

                    for chat in result:
                        match = jid_map.get(chat["remoteJid"])
                        if match:
                            chat.update(match)
                        else:
                            chat.update({"situacao": None, "campanha": None, "prospect_contact_id": None, "observacoes": None})
                
                return result
        except Exception as e:
            logger.error(f"Erro ao buscar contatos via API Evolution para '{instance_name}': {e}")
            return []

    async def fetch_messages_from_api_exhaustive(self, instance_name: str, remote_jid: str = None, jids: List[str] = None, count: int = 100, format: bool = True) -> List[Dict[str, Any]]:
        """
        Busca mensagens de forma exaustiva na Evolution API, consultando todos os JIDs relacionados
        (LID, 8/9 dígitos, etc) em paralelo para garantir que nada seja perdido.
        """
        all_target_jids = jids or []
        if not all_target_jids and remote_jid:
            all_target_jids = await self.get_all_jids_for_contact(remote_jid)
        
        if not all_target_jids:
            return []

        # Remove duplicatas e limpa JIDs
        all_target_jids = list(set([j.strip() for j in all_target_jids if j and j.strip()]))
        logger.info(f"[API History] Buscando exaustivamente para JIDs: {all_target_jids}")

        async def fetch_single_jid(jid: str):
            url = f"{self.api_url}/chat/findMessages/{instance_name}"
            payload = {"where": {"remoteJid": jid}}
            params = {"limit": count}
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.post(url, headers=self.headers, json=payload, params=params)
                    response.raise_for_status()
                    data = response.json()
                    
                    records = []
                    if isinstance(data, list): records = data
                    elif isinstance(data, dict):
                        records = data.get("records") or data.get("messages") or []
                        if isinstance(records, dict) and "records" in records: records = records["records"]
                    
                    return records if isinstance(records, list) else []
            except Exception as e:
                logger.warning(f"Erro ao buscar mensagens para JID {jid}: {e}")
                return []

        # Executa as buscas em paralelo
        tasks = [fetch_single_jid(jid) for jid in all_target_jids]
        results = await asyncio.gather(*tasks)

        # Mescla e remove duplicatas por ID de mensagem
        merged_map = {}
        for records in results:
            for m in records:
                if not isinstance(m, dict): continue
                m_id = m.get("key", {}).get("id")
                if m_id and m_id not in merged_map:
                    merged_map[m_id] = m
                elif m_id:
                    # Se já existe, mantém o que tem timestamp (ou o mais completo)
                    pass

        # Converte para lista, ordena e aplica filtro de segurança final
        final_messages = list(merged_map.values())
        final_messages.sort(key=lambda x: x.get("messageTimestamp", 0))
        
        # Filtro de segurança final: garante que as mensagens pertencem aos JIDs solicitados
        # (Isso evita que mensagens de outros contatos apareçam caso a API ignore o filtro 'where')
        formatted = []
        for m in final_messages:
            if not isinstance(m, dict): continue
            m_key = m.get("key", {})
            m_jid = m_key.get("remoteJid") or m.get("remoteJid")
            m_jid_alt = m_key.get("remoteJidAlt") or m.get("remoteJidAlt")
            
            if any(jid in all_target_jids for jid in [m_jid, m_jid_alt] if jid):
                formatted.append(self.format_evolution_message(m) if format else m)
        
        # Retorna apenas a quantidade solicitada (as mais recentes)
        return formatted[-count:] if count > 0 else formatted

    async def fetch_messages_from_api(self, instance_name: str, remote_jid: str, count: int = 50, format: bool = True) -> List[Dict[str, Any]]:
        """
        Busca mensagens de um contato diretamente na Evolution API.
        Agora redireciona para a busca exaustiva para garantir completude.
        """
        return await self.fetch_messages_from_api_exhaustive(instance_name, remote_jid=remote_jid, count=count, format=format)

    async def fetch_all_groups(self, instance_name: str) -> List[Dict[str, Any]]:
        """Busca grupos na Evolution API."""
        url = f"{self.api_url}/group/fetchAllGroups/{instance_name}?getParticipants=false"
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(url, headers=self.headers, timeout=30.0)
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"Erro ao buscar grupos: {e}")
            return []

    async def delete_message_for_everyone(self, instance_name: str, remote_jid: str, message_id: str):
        """Deleta uma mensagem para todos (Revoke)."""
        url = f"{self.api_url}/chat/deleteMessageForEveryone/{instance_name}"
        
        # Garante que o remoteJid esteja no formato correto se não for um grupo
        if "@" not in remote_jid:
            normalized = self._normalize_number(remote_jid)
            remote_jid = f"{normalized}@s.whatsapp.net"

        payload = {
            "id": message_id,
            "remoteJid": remote_jid,
            "fromMe": True
        }
        try:
            async with httpx.AsyncClient() as client:
                # Usa request("DELETE") para garantir o envio do body, já que client.delete pode ignorar
                await client.request("DELETE", url, headers=self.headers, json=payload, timeout=10.0)
        except Exception as e:
            logger.error(f"Falha ao deletar mensagem {message_id} em {remote_jid}: {e}")

    async def mark_messages_as_read(self, instance_name: str, remote_jid: str, message_ids: List[str]):
        """
        Marca mensagens como lidas na Evolution API.
        """
        if not message_ids:
            return None

        url = f"{self.api_url}/chat/markMessageAsRead/{instance_name}"
        
        # Se não for um grupo e não tiver @, normaliza para o formato do WhatsApp
        if "@" not in remote_jid:
            normalized = self._normalize_number(remote_jid)
            remote_jid = f"{normalized}@s.whatsapp.net"

        read_messages = [
            {
                "remoteJid": remote_jid,
                "fromMe": False, # Marcamos como lidas as mensagens que RECEBEMOS do contato
                "id": msg_id
            }
            for msg_id in message_ids
        ]

        payload = {"readMessages": read_messages}

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, headers=self.headers, json=payload, timeout=10.0)
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"Falha ao marcar mensagens como lidas para {remote_jid}: {e}")
            return None

    async def get_jid_options_from_db(self, instance_name: str, remote_jid: str) -> Optional[List[Dict[str, Any]]]:
        """
        Busca as opções de JID (jidOptions) na tabela IsOnWhatsapp do banco da Evolution.
        """
        if not self.db_url:
            logger.error("EVOLUTION_DATABASE_URL não configurada.")
            return None

        try:
            db_url = self.db_url.replace("postgresql+asyncpg://", "postgresql://")
            conn = await asyncpg.connect(db_url)
            try:
                query = 'SELECT "jidOptions" FROM "IsOnWhatsapp" WHERE "id" = $1 OR "lid" = $1'
                jid_options_json = await conn.fetchval(query, remote_jid)

                if jid_options_json:
                    if isinstance(jid_options_json, str):
                        try:
                            return json.loads(jid_options_json)
                        except json.JSONDecodeError:
                            # Se falhar o JSON, tenta processar como string separada por vírgulas
                            if ',' in jid_options_json or '@' in jid_options_json:
                                return [{"jid": j.strip()} for j in jid_options_json.split(',') if j.strip()]
                            return None
                    return jid_options_json
                return None
            finally:
                await conn.close()
        except Exception as e:
            logger.error(f"Erro ao buscar jidOptions no DB da Evolution: {e}")
            return None

    async def get_all_jids_for_contact(self, remote_jid: str) -> List[str]:
        """
        Busca todos os JIDs relacionados a um contato (LID, variações de número 8/9 dígitos)
        conforme solicitado, pesquisando na tabela IsOnWhatsapp (colunas jid e jidOptions).
        """
        if not self.db_url:
            return [remote_jid] if "@" in remote_jid else [f"{remote_jid}@s.whatsapp.net"]

        # Se for grupo, retorna apenas ele mesmo
        if "@g.us" in remote_jid:
            return [remote_jid]

        jids = {remote_jid}
        
        # 1. Normalização inicial (adiciona variações de 8/9 dígitos se for número brasileiro)
        clean_num = "".join(filter(str.isdigit, remote_jid.split("@")[0]))
        if clean_num.isdigit() and len(clean_num) >= 10:
            standard_jid = f"{clean_num}@s.whatsapp.net"
            jids.add(standard_jid)
            
            if clean_num.startswith('55'):
                if len(clean_num) == 13: # Com 9
                    without_9 = clean_num[:4] + clean_num[5:]
                    jids.add(f"{without_9}@s.whatsapp.net")
                elif len(clean_num) == 12: # Sem 9
                    with_9 = clean_num[:4] + '9' + clean_num[4:]
                    jids.add(f"{with_9}@s.whatsapp.net")

        try:
            async with self.get_evolution_db_connection() as conn:
                # 2. Busca na tabela IsOnWhatsapp
                # Procuramos o JID fornecido ou qualquer uma de suas variações nas colunas 'jid' ou 'jidOptions'
                # jidOptions é uma string separada por vírgula
                jid_list = list(jids)
                query = """
                    SELECT "id" as jid, "jidOptions", "lid" 
                    FROM "IsOnWhatsapp" 
                    WHERE "id" = ANY($1::text[]) 
                       OR "lid" = ANY($1::text[])
                       OR EXISTS (
                           SELECT 1 FROM unnest($1::text[]) AS val 
                           WHERE "jidOptions" LIKE '%' || val || '%'
                       )
                """
                rows = await conn.fetch(query, jid_list)
                
                for row in rows:
                    if row.get("jid"): jids.add(row["jid"])
                    if row.get("lid"): jids.add(row["lid"])
                    if row.get("jidOptions"):
                        # Split das opções vinculadas
                        opts = [opt.strip() for opt in row["jidOptions"].split(',') if opt.strip()]
                        jids.update(opts)
        except Exception as e:
            logger.error(f"Erro ao buscar JIDs relacionados para {remote_jid}: {e}")
            
        return [j for j in list(jids) if j and "@" in j]

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
                response.raise_for_status()
                results = response.json()
            return results
        except Exception as e:
            logger.error(f"Falha ao verificar números no WhatsApp: {e}")
            return None

    async def send_presence(self, instance_name: str, number: str, presence: str = "composing", delay: int = 1200):
        """
        Envia o status de presença (ex: 'composing' para 'Digitando...') para um número.
        """
        normalized_number = self._normalize_number(number)
        url = f"{self.api_url}/chat/sendPresence/{instance_name}"
        
        # Payload para Evolution API v2
        payload = {
            "number": normalized_number,
            "presence": presence,
            "delay": int(delay)
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, headers=self.headers, json=payload, timeout=5.0)
                # Ignora erro 404 (Group not found / Number not found) conforme solicitado
                if response.status_code == 404:
                    return
                response.raise_for_status()
        except Exception as e:
            logger.warning(f"Falha ao enviar status '{presence}' para {normalized_number}: {e}")

    async def check_prospect_messages(self, db: AsyncSession, user: models.User, instance_id: Optional[int] = None):
        """
        Verifica se há novas mensagens de contatos em prospecção e atualiza o status.
        Se instance_id for fornecido, filtra apenas contatos vinculados a essa instância.
        """
        from app.crud import crud_prospect, crud_config
        from app.services.gemini_service import get_gemini_service
        from app.api.prospecting import _synchronize_and_process_history
        
        logger.info(f"Verificando mensagens de prospecção para o usuário {user.id} (Instância: {instance_id or 'Todas'})...")
        
        gemini_service = get_gemini_service()
        prospects = await crud_prospect.get_prospects_by_user(db, user.id)
        
        for prospect in prospects:
            if prospect.status not in ["Em Andamento", "Pausado"]:
                continue
            
            persona_config = await crud_config.get_config(db, prospect.config_id, user.id)
            if not persona_config:
                continue

            contacts_details = await crud_prospect.get_prospect_contacts_with_details(db, prospect.id)
            
            for item in contacts_details:
                pc = item.ProspectContact
                contact = item.Contact
                
                terminal_statuses = ["Não Interessado", "Concluído", "Falha no Envio", "Conversa Manual", "Fechado", "Atendente Chamado", "Resposta Recebida"]
                if pc.situacao in terminal_statuses:
                    continue
                
                if not pc.whatsapp_instance:
                    continue

                try:
                    history = await _synchronize_and_process_history(
                        db=db,
                        prospect_contact=pc,
                        user=user,
                        persona_config=persona_config,
                        whatsapp_service=self,
                        gemini_service=gemini_service,
                        whatsapp_instance=pc.whatsapp_instance
                    )
                    
                    if history:
                        last_msg = history[-1]
                        role = last_msg.get("role")
                        
                        if role == "user":
                            await crud_prospect.update_prospect_contact_status(db, pc.id, "Resposta Recebida")
                            
                except Exception:
                    pass

_whatsapp_service_instance = None
def get_whatsapp_service():
    global _whatsapp_service_instance
    if _whatsapp_service_instance is None:
        _whatsapp_service_instance = WhatsAppService()
    return _whatsapp_service_instance