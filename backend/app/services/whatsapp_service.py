import httpx
from app.core.config import settings
import logging
import json
from typing import Dict, Any, List, Optional
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
    def __init__(self):
        self.api_url = settings.EVOLUTION_API_URL
        self.api_key = settings.EVOLUTION_API_KEY
        self.headers = {"apikey": self.api_key, "Content-Type": "application/json"}
        self.db_url = getattr(settings, "EVOLUTION_DATABASE_URL", None)

    def _normalize_number(self, number: str) -> str:
        clean_number = "".join(filter(str.isdigit, str(number)))
        # Se não começa com 55 e tem 10 ou 11 dígitos, assume Brasil e adiciona 55
        if not clean_number.startswith("55") and len(clean_number) in [10, 11]:
            clean_number = "55" + clean_number
            
        # Trata o nono dígito para números brasileiros (55 + DDD + 9 + 8 dígitos)
        if len(clean_number) == 13 and clean_number.startswith("55"):
            if clean_number[4] == '9':
                return clean_number[:4] + clean_number[5:]
        return clean_number

    async def fetch_instance(self, instance_name: str) -> dict:
        """
        Busca os dados da instância na Evolution API (fetchInstances).
        Útil para recuperar o 'owner' (número conectado).
        """
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

                print(data)

                # A resposta é uma lista.
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
        if "@" in number:
            normalized_number = number
        else:
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
                return response.json()
        except Exception as e:
            logger.error(f"Falha CRÍTICA ao enviar mensagem para {normalized_number}. Erro: {e}")
            raise MessageSendError(f"Falha no envio: {e}") from e

    async def send_media_message(self, instance_name: str, number: str, media: str, media_type: str, mime_type: str, caption: str = "", file_name: str = "arquivo", delay: int = 0):
        if "@" in number:
            normalized_number = number
        else:
            normalized_number = self._normalize_number(number)
            
        # Rota da Evolution API para enviar mídia
        url = f"{self.api_url}/message/sendMedia/{instance_name}"
        
        payload = {
            "number": normalized_number,
            "media": media, # Base64
            "mediatype": media_type, # image, video, document
            "mimetype": mime_type,
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
        payload = {
            "number": normalized_number,
            "audio": audio_base64,
            "delay": delay
        }
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, headers=self.headers, json=payload, timeout=60.0)
                response.raise_for_status()
                logger.info(f"Áudio enviado com sucesso para {normalized_number}.")
                return response.json()
        except Exception as e:
            logger.error(f"Falha ao enviar áudio para {normalized_number}. Erro: {e}")
            raise MessageSendError(f"Falha no envio de áudio: {e}") from e

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

        media_types = ["audioMessage", "imageMessage", "videoMessage", "documentMessage", "stickerMessage"]
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
            },
            "convertToMp4": True if media_type_key == "videoMessage" else False
        }

        # 3. Fazer a requisição para obter o base64
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, headers=self.headers, json=payload, timeout=60.0)
                response.raise_for_status()
                
                response_data = response.json()
                media_base64 = response_data.get("base64")
                api_mime_type = response_data.get("mimetype") or mime_type

                if not media_base64:
                    logger.error(f"A API retornou sucesso mas não incluiu o 'base64' da mídia para a mensagem {message_id}.")
                    return None
                
                # 4. Retornar os dados no formato esperado pelo GeminiService
                # O GeminiService já sabe como lidar com base64 string.
                return {"mime_type": api_mime_type, "data": media_base64}

        except httpx.HTTPStatusError as e:
            logger.error(f"Falha de status HTTP ao buscar mídia em base64 para msg {message_id}: {e.response.status_code} - {e.response.text}", exc_info=True)
            return None
        except Exception as e:
            logger.error(f"Falha ao buscar mídia em base64 para msg {message_id}: {e}", exc_info=True)
            return None

    async def get_media_by_message_id(self, instance_name: str, message_id: str) -> Optional[Dict[str, Any]]:
        """
        Busca o base64 da mídia apenas pelo ID da mensagem.
        """
        url = f"{self.api_url}/chat/getBase64FromMediaMessage/{instance_name}"
        payload = {
            "message": { "key": { "id": message_id } },
            "convertToMp4": True
        }
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, headers=self.headers, json=payload, timeout=60.0)
                response.raise_for_status()
                data = response.json()
                return {
                    "base64": data.get("base64"),
                    "mimetype": data.get("mimetype")
                }
        except Exception as e:
            logger.error(f"Falha ao buscar mídia por ID {message_id}: {e}")
            return None

    async def fetch_chats(self, evolution_instance_id: str, limit: int = 100, db: Optional[AsyncSession] = None, user_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Busca a lista de conversas únicas (última mensagem de cada JID) 
        diretamente no banco de dados da Evolution API.

        Esta função realiza uma consulta otimizada no banco de dados da Evolution API para recuperar
        as conversas mais recentes de uma instância específica. Se uma sessão de banco de dados (db)
        e um ID de usuário (user_id) forem fornecidos, a função também tentará correlacionar os JIDs
        encontrados com os contatos de prospecção existentes no banco de dados local do ProspectAI,
        enriquecendo os dados com informações de campanha e situação atual.

        Args:
            evolution_instance_id (str): O UUID da instância dentro da Evolution API.
            limit (int, optional): O número máximo de conversas a serem retornadas. Padrão é 100.
            db (AsyncSession, optional): Sessão assíncrona do SQLAlchemy para consulta local.
            user_id (int, optional): ID do usuário proprietário das prospecções para correlação.

        Returns:
            List[Dict[str, Any]]: Uma lista de dicionários, onde cada dicionário representa uma conversa
            contendo campos como remoteJid, name, lastMessage, timestamp, status, e campos de correlação
            (situacao, campanha, prospect_contact_id) se aplicável.
        """
        # 1. Verifica se a URL do banco de dados da Evolution está configurada nas variáveis de ambiente
        if not self.db_url:
            logger.error("EVOLUTION_DATABASE_URL não configurada.")
            return []

        try:
            # 2. Prepara a URL de conexão para o driver asyncpg (remove o prefixo do SQLAlchemy se necessário)
            db_url = self.db_url.replace("postgresql+asyncpg://", "postgresql://")
            conn = await asyncpg.connect(db_url)
            try:
                # 3. Define a query SQL otimizada para buscar a última mensagem de cada chat
                # Otimização: Busca as mensagens mais recentes primeiro usando DISTINCT ON e depois associa aos contatos.
                # Isso evita o LATERAL join que é extremamente pesado em bases grandes.
                query = """
                    WITH LatestMessages AS (
                        -- Seleciona apenas a mensagem mais recente de cada chat (JID)
                        -- O DISTINCT ON garante uma única linha por identificador de chat
                        SELECT DISTINCT ON (COALESCE("key"->>'remoteJidAlt', "key"->>'remoteJid'))
                            -- Prioriza remoteJidAlt (LID) sobre remoteJid para evitar duplicidade de chats vinculados
                            COALESCE("key"->>'remoteJidAlt', "key"->>'remoteJid') as "remoteJid",
                            "message",
                            "key",
                            "status",
                            "messageTimestamp",
                            "instanceId",
                            "pushName"
                        FROM "Message"
                        WHERE "instanceId" = $1
                        -- Ordenação necessária para o DISTINCT ON: agrupa por JID e pega o timestamp mais recente (DESC)
                        ORDER BY COALESCE("key"->>'remoteJidAlt', "key"->>'remoteJid'), "messageTimestamp" DESC
                    )
                    SELECT 
                        lm."remoteJid",
                        lm."pushName" as last_message_sender,
                        c."pushName" as display_name,
                        c."profilePicUrl",
                        c."updatedAt",
                        lm.message,
                        lm.key,
                        lm.status,
                        lm."messageTimestamp"
                    FROM LatestMessages lm
                    -- Enriquece os dados da mensagem com informações do contato (nome, foto)
                    LEFT JOIN "Contact" c ON c."remoteJid" = lm."remoteJid" AND c."instanceId" = lm."instanceId"
                    -- Filtra apenas chats válidos: individuais (@s.whatsapp.net), grupos (@g.us) ou identidades vinculadas (@lid)
                    WHERE (lm."remoteJid" LIKE '%@s.whatsapp.net' OR lm."remoteJid" LIKE '%@g.us' OR lm."remoteJid" LIKE '%@lid')
                    -- Ordena a lista final para que os chats mais recentes apareçam primeiro (estilo Inbox)
                    ORDER BY lm."messageTimestamp" DESC NULLS LAST
                    LIMIT $2
                """
                # 4. Executa a query no banco de dados da Evolution
                rows = await conn.fetch(query, evolution_instance_id, limit)
                
                # 5. Processa as linhas retornadas para o formato de dicionário esperado pelo frontend
                chats = []
                for row in rows:
                    msg_obj = json.loads(row["message"]) if isinstance(row["message"], str) else row["message"]
                    key_obj = json.loads(row["key"]) if isinstance(row["key"], str) else row["key"]
                    remote_jid = row["remoteJid"]
                    
                    # Extrai o conteúdo textual ou um marcador de mídia para exibição na lista
                    content = ""
                    if msg_obj:
                        content = msg_obj.get("conversation") or msg_obj.get("extendedTextMessage", {}).get("text", "")
                        if not content:
                            if "imageMessage" in msg_obj: content = "[Imagem]"
                            elif "videoMessage" in msg_obj: content = "[Vídeo]"
                            elif "audioMessage" in msg_obj: content = "[Áudio]"
                            elif "documentMessage" in msg_obj: content = "[Documento]"
                            elif "stickerMessage" in msg_obj: content = "[Figurinha]"
                            else: content = "[Mídia]"

                    chats.append({
                        "id": remote_jid,
                        "remoteJid": remote_jid,
                        "name": row["display_name"] or remote_jid.split("@")[0],
                        "profilePicUrl": row["profilePicUrl"],
                        "isGroup": "@g.us" in remote_jid,
                        "lastMessage": content,
                        "timestamp": row["messageTimestamp"] or int(row["updatedAt"].timestamp()),
                        "status": row["status"],
                        "fromMe": key_obj.get("fromMe", False) if key_obj else False,
                        "lastMessageSender": row["last_message_sender"]
                    })

                # 6. Correlaciona com o banco do ProspectAI se db e user_id forem fornecidos.
                # Isso permite exibir o status da campanha e a situação do lead diretamente na lista de chats.
                if db and user_id:
                    # Busca em TODAS as prospecções do usuário para aumentar a chance de match
                    stmt = (
                        select(models.ProspectContact, models.Prospect.nome_prospeccao, models.Contact.whatsapp)
                        .join(models.Prospect, models.ProspectContact.prospect_id == models.Prospect.id)
                        .join(models.Contact, models.ProspectContact.contact_id == models.Contact.id)
                        .where(models.Prospect.user_id == user_id)
                        .order_by(models.ProspectContact.updated_at.desc())
                    )
                    result = await db.execute(stmt)
                    prospect_contacts = result.all()

                    # Cria um mapa de JID para dados de prospecção para busca rápida (O(1))
                    jid_map = {}
                    for pc, campaign_name, whatsapp in prospect_contacts:
                        correlation_data = {
                            "situacao": pc.situacao,
                            "campanha": campaign_name,
                            "prospect_contact_id": pc.id
                        }
                        # 1. Mapeia pelo número de telefone (formato JID padrão)
                        normalized = self._normalize_number(whatsapp)
                        standard_jid = f"{normalized}@s.whatsapp.net"
                        if standard_jid not in jid_map:
                            jid_map[standard_jid] = correlation_data
                        
                        # 2. Mapeia pelos JIDs salvos em jid_options (incluindo LIDs e variações)
                        if pc.jid_options:
                            jids = [j.strip() for j in pc.jid_options.split(',') if j.strip()]
                            for jid in jids:
                                if jid not in jid_map: jid_map[jid] = correlation_data

                    # Aplica a correlação nos chats encontrados
                    for chat in chats:
                        match = jid_map.get(chat["remoteJid"])
                        chat["situacao"] = match["situacao"] if match else None
                        chat["campanha"] = match["campanha"] if match else None
                        chat["prospect_contact_id"] = match["prospect_contact_id"] if match else None

                return chats
            finally:
                # 7. Garante o fechamento da conexão com o banco de dados da Evolution
                await conn.close()
        except Exception as e:
            logger.error(f"Erro ao buscar chats no banco de dados da Evolution: {e}", exc_info=True)
            return []

    def format_evolution_message(self, raw_msg: Dict[str, Any]) -> Dict[str, Any]:
        """Converte o formato da Evolution para o formato interno do chat."""
        key = raw_msg.get("key", {})
        msg_content = raw_msg.get("message", {})
        
        content = ""
        msg_type = "text"
        extra_data = {}

        if msg_content:
            content = msg_content.get("conversation") or msg_content.get("extendedTextMessage", {}).get("text", "")
            if "imageMessage" in msg_content: msg_type = "image"
            elif "videoMessage" in msg_content: msg_type = "video"
            elif "audioMessage" in msg_content: msg_type = "audio"
            elif "stickerMessage" in msg_content: msg_type = "sticker"
            elif "documentMessage" in msg_content: msg_type = "document"
            elif "locationMessage" in msg_content: 
                msg_type = "location"
                loc_msg = msg_content["locationMessage"]
                extra_data["latitude"] = loc_msg.get("degreesLatitude")
                extra_data["longitude"] = loc_msg.get("degreesLongitude")
                extra_data["thumbnail"] = loc_msg.get("jpegThumbnail")
            if not content and msg_type != "text" and msg_type != "location":
                content = msg_content.get(f"{msg_type}Message", {}).get("caption", "")

        result = {
            "id": key.get("id"),
            "role": "assistant" if key.get("fromMe") else "user",
            "senderName": raw_msg.get("pushName"),
            "content": content,
            "type": msg_type,
            "timestamp": raw_msg.get("messageTimestamp"),
            "status": raw_msg.get("status")
        }
        result.update(extra_data)
        return result

    async def fetch_chat_history(self, instance_name: str, number: str, count: int = 999, mode: str = None, jids: List[str] = None, evolution_instance_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Busca o histórico de mensagens diretamente no banco de dados da Evolution API.
        Se 'jids' for fornecido, busca por esses JIDs exatos.
        Caso contrário, usa 'number' para uma busca aproximada (LIKE).
        """
        if not self.db_url:
            logger.error("EVOLUTION_DATABASE_URL não configurada. Não é possível buscar histórico via DB.")
            return []

        # LOG DE DEBUG: Essencial para entender o que ocorre em produção (verifique os logs do container)
        logger.info(f"Fetch History: Instance='{instance_name}', Number='{number}', JIDs='{jids}'")

        try:
            # Remove o prefixo '+asyncpg' se presente, pois o driver asyncpg puro não o reconhece
            db_url = self.db_url.replace("postgresql+asyncpg://", "postgresql://")
            
            conn = await asyncpg.connect(db_url)
            try:
                # 1. Verifica se a instância existe e pega o ID (Evita queries pesadas se o nome estiver errado)
                if evolution_instance_id:
                    instance_id = evolution_instance_id
                else:
                    instance_id = await conn.fetchval('SELECT id FROM "Instance" WHERE name = $1', instance_name)
                
                if not instance_id:
                    logger.warning(f"Fetch History: Instância '{instance_name}' NÃO ENCONTRADA no banco da Evolution.")
                    return []

                # Lógica: Contact -> IsOnWhatsapp -> Message
                all_target_jids = []
                
                # Se não temos JIDs mas temos número, tentamos achar o JID no Contact
                if not jids and number:
                    clean_number = "".join(filter(str.isdigit, str(number)))
                    # Busca JID na tabela Contact
                    contact_jid = await conn.fetchval(
                        'SELECT "remoteJid" FROM "Contact" WHERE "instanceId" = $1 AND "remoteJid" LIKE $2 LIMIT 1',
                        instance_id, f"%{clean_number}%"
                    )
                    if contact_jid:
                        jids = [contact_jid]

                if jids:
                    for jid in jids:
                        # Busca correlações na tabela IsOnWhatsapp
                        jid_options_str = await conn.fetchval('SELECT "jidOptions" FROM "IsOnWhatsapp" WHERE "remoteJid" = $1', jid)
                        if jid_options_str:
                            options = [j.strip() for j in jid_options_str.split(',') if j.strip()]
                            all_target_jids.extend(options)
                        else:
                            all_target_jids.append(jid)
                    
                    all_target_jids = list(set(all_target_jids))

                if all_target_jids:
                    query = """
                        SELECT "key", "message", "messageTimestamp", "pushName", "status"
                        FROM "Message"
                        WHERE "instanceId" = $1
                          AND (
                            "key"->>'remoteJid' = ANY($2::text[])
                            OR "key"->>'remoteJidAlt' = ANY($2::text[])
                          )
                        ORDER BY "messageTimestamp" DESC
                        LIMIT $3
                    """
                    rows = await conn.fetch(query, instance_id, all_target_jids, count)
                else:
                    # 1. Limpeza básica
                    clean_number = "".join(filter(str.isdigit, str(number)))
                    
                    # Estratégia de extração do "núcleo" do número (últimos 8 dígitos)
                    search_term = clean_number

                    # Lógica para números brasileiros (geralmente > 8 dígitos)
                    if len(clean_number) >= 8:
                        # Se parece ser um número brasileiro completo (12 ou 13 dígitos começando com 55)
                        if clean_number.startswith("55") and len(clean_number) in [12, 13]:
                            # Remove 55 (DDI) e os 2 seguintes (DDD) -> Pula 4 caracteres
                            raw_local = clean_number[4:]
                        
                        # Se parece ser um número com DDD mas sem DDI (10 ou 11 dígitos)
                        elif len(clean_number) in [10, 11]:
                            # Remove os 2 primeiros (DDD) -> Pula 2 caracteres
                            raw_local = clean_number[2:]
                        
                        # Se já parece ser local (8 ou 9 dígitos)
                        else:
                            raw_local = clean_number

                        # Tratamento do 9º dígito no número local
                        if len(raw_local) == 9 and raw_local.startswith('9'):
                            search_term = raw_local[1:] # Pega os últimos 8
                        elif len(raw_local) >= 8:
                            search_term = raw_local[-8:] # Garante pegar apenas os últimos 8
                        else:
                            search_term = raw_local

                    query = """
                        SELECT "key", "message", "messageTimestamp", "pushName", "status"
                        FROM "Message"
                        WHERE "instanceId" = $1
                          AND (
                            "key"->>'remoteJid' LIKE $2
                            OR "key"->>'remoteJidAlt' LIKE $2
                          )
                        ORDER BY "messageTimestamp" DESC
                        LIMIT $3
                    """
                    like_pattern = f"%{search_term}%"
                    rows = await conn.fetch(query, instance_id, like_pattern, count)
                
                messages = []
                for row in rows:
                    # Converte os dados para o formato esperado pelo restante da aplicação
                    messages.append({
                        "key": json.loads(row["key"]) if isinstance(row["key"], str) else row["key"],
                        "message": json.loads(row["message"]) if isinstance(row["message"], str) else row["message"],
                        "messageTimestamp": row["messageTimestamp"],
                        "pushName": row["pushName"],
                        "status": row["status"]
                    })
                
                if not messages and mode and mode != 'initial':
                    raise ValueError(f"Histórico vazio para contato {number} em modo '{mode}'.")

                search_desc = f"JIDs: {jids}" if jids else f"Termo: {like_pattern}"
                logger.info(f"Histórico carregado via DB ({search_desc}). Total: {len(messages)}.")
                return messages
            finally:
                await conn.close()
        except ValueError:
            raise
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
                query = 'SELECT "jidOptions" FROM "IsOnWhatsapp" WHERE "remoteJid" = $1'
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
        Busca todos os JIDs relacionados a um contato na tabela IsOnWhatsapp do banco da Evolution.
        Retorna uma lista contendo o JID original e quaisquer variações encontradas (jidOptions).
        """
        if not self.db_url:
            return [remote_jid]

        try:
            db_url = self.db_url.replace("postgresql+asyncpg://", "postgresql://")
            conn = await asyncpg.connect(db_url)
            try:
                # Busca na tabela IsOnWhatsapp
                query = 'SELECT "jidOptions" FROM "IsOnWhatsapp" WHERE "remoteJid" = $1'
                jid_options_str = await conn.fetchval(query, remote_jid)
                
                jids = {remote_jid}
                if jid_options_str:
                    # Trata o formato CSV conforme exemplo fornecido pelo usuário
                    # Ex: "5545999924229@s.whatsapp.net,55459924229@s.whatsapp.net"
                    parts = [j.strip() for j in jid_options_str.split(',') if j.strip()]
                    jids.update(parts)
                
                return list(jids)
            finally:
                await conn.close()
        except Exception as e:
            logger.error(f"Erro ao buscar JIDs relacionados para {remote_jid}: {e}")
            return [remote_jid]

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
                        whatsapp_instance=current_instance
                    )
                    
                    if history:
                        last_msg = history[-1]
                        role = last_msg.get("role")
                        
                        if role == "user":
                            logger.info(f"Mensagem recente encontrada de {contact.nome}. Atualizando para 'Resposta Recebida'.")
                            await crud_prospect.update_prospect_contact_status(db, pc.id, "Resposta Recebida")
                            
                except Exception as e:
                    logger.error(f"Erro ao verificar mensagens para {contact.nome}: {e}")

_whatsapp_service_instance = None
def get_whatsapp_service():
    global _whatsapp_service_instance
    if _whatsapp_service_instance is None:
        _whatsapp_service_instance = WhatsAppService()
    return _whatsapp_service_instance