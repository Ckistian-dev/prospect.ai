import asyncio
import json
import logging
import re
import csv
import base64
import io
from typing import Dict, List, Any, Optional, Tuple
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, File, UploadFile, Form, Query, Body, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone
from sqlalchemy import or_
from app.api import dependencies
from app.db.database import get_db
from app.db import models, schemas
from app.db.schemas import Prospect, ProspectCreate, ProspectUpdate, ProspectContactUpdate
from app.crud import crud_prospect, crud_config, crud_user
from app.services.whatsapp_service import WhatsAppService, get_whatsapp_service, MessageSendError
from app.services.gemini_service import GeminiService, get_gemini_service

logger = logging.getLogger(__name__)
router = APIRouter()

async def _process_raw_message(
    raw_msg: dict, 
    history_list_for_context: list,
    instance_name: str, 
    persona_config: models.Config,
    whatsapp_service: WhatsAppService, 
    gemini_service: GeminiService,
    db: AsyncSession,
    user: models.User
) -> Tuple[Optional[Dict[str, Any]], int]:
    try:
        key = raw_msg.get("key", {})
        msg_content = raw_msg.get("message", {})
        msg_id = key.get("id")
        timestamp_unix = raw_msg.get("messageTimestamp")

        if not msg_content or not msg_id: return None, 0
        role = "assistant" if key.get("fromMe") else "user"
        content = ""
        tokens_used = 0
        media_meta = {}
        
        if msg_content.get("conversation") or msg_content.get("extendedTextMessage"):
            content = msg_content.get("conversation") or msg_content.get("extendedTextMessage", {}).get("text", "")
        
        elif msg_content.get("contactMessage"):
            contact_msg = msg_content.get("contactMessage")
            display_name = contact_msg.get("displayName", "Desconhecido")
            vcard = contact_msg.get("vcard", "")
            content = f"[Contato Compartilhado] Nome: {display_name}"
            if vcard:
                waid_match = re.search(r'waid=(\d+)', vcard)
                if waid_match:
                    content += f", WhatsApp: {waid_match.group(1)}"

        elif msg_content.get("locationMessage"):
            loc_msg = msg_content["locationMessage"]
            lat = loc_msg.get("degreesLatitude")
            long = loc_msg.get("degreesLongitude")
            content = f"[Localização] https://maps.google.com/?q={lat},{long}"
            media_meta["type"] = "location"
            media_meta["latitude"] = lat
            media_meta["longitude"] = long
            media_meta["thumbnail"] = loc_msg.get("jpegThumbnail")

        elif msg_content.get("audioMessage") or msg_content.get("imageMessage") or msg_content.get("documentMessage") or msg_content.get("stickerMessage"):
            media_data = await whatsapp_service.get_media_and_convert(instance_name, raw_msg)
            if media_data:
                # Passa o histórico apenas para análise de mídia, não para transcrição de áudio.
                if 'image' in media_data['mime_type']:
                    media_meta["mediaType"] = "sticker" if "stickerMessage" in msg_content else "image"
                    media_meta["mimeType"] = media_data['mime_type']

                history_for_analysis = history_list_for_context if 'audio' not in media_data['mime_type'] else None
                analysis, tokens_used = await gemini_service.transcribe_and_analyze_media(
                    media_data, persona_config, db, user, db_history=history_for_analysis
                )
                
                if 'audio' in media_data['mime_type']:
                    content = f"[Áudio transcrito]: {analysis}"
                else:
                    content = f"[Análise de Mídia]: {analysis}"
                    caption_text = ""
                    if msg_content.get("imageMessage"): caption_text = msg_content["imageMessage"].get("caption", "").strip()
                    elif msg_content.get("documentMessage"): caption_text = msg_content["documentMessage"].get("caption", "").strip()
                    if caption_text: content += f"\n[Legenda da Mídia]: {caption_text}"
            else:
                content = "[Falha ao processar mídia]"

        timestamp_iso = None
        if timestamp_unix:
            try:
                timestamp_iso = datetime.fromtimestamp(int(timestamp_unix), tz=timezone.utc).isoformat()
            except (ValueError, TypeError):
                logger.warning(f"Could not parse timestamp: {timestamp_unix}")

        if content and content.strip():
            processed_msg = {
                "id": msg_id, 
                "role": role, 
                "content": content,
                "senderName": raw_msg.get("pushName")
            }
            if timestamp_iso:
                processed_msg["timestamp"] = timestamp_iso
            if media_meta:
                processed_msg.update(media_meta)
            return processed_msg, tokens_used
        return None, 0
        
    except Exception as e:
        logger.error(f"Erro ao processar mensagem individual ID {msg_id}: {e}", exc_info=True)
        return None, 0

def _get_sort_key(msg: Dict[str, Any]) -> str:
    """Helper para ordenar mensagens por timestamp, com fallback para o ID."""
    if msg.get("timestamp"):
        return msg["timestamp"]
    
    msg_id = str(msg.get("id", ""))
    if msg_id.startswith(("sent_", "internal_")):
        try:
            parts = msg_id.split('_')
            if len(parts) >= 2:
                return parts[1]
        except:
            pass
    return "1970-01-01T00:00:00+00:00"

async def _synchronize_and_process_history(
    db: AsyncSession, 
    prospect_contact: models.ProspectContact,
    user: models.User, 
    persona_config: models.Config,
    whatsapp_service: WhatsAppService,
    gemini_service: GeminiService,
    mode: str = None,
    whatsapp_instance: Optional[models.WhatsappInstance] = None
) -> List[Dict[str, Any]]:
    
    # Prioriza a instância passada como argumento
    if not whatsapp_instance:
        whatsapp_instance = prospect_contact.whatsapp_instance
        
    # Se ainda for None, tenta carregar pelo ID (caso não tenha sido feito eager load)
    if not whatsapp_instance and prospect_contact.whatsapp_instance_id:
        whatsapp_instance = await db.get(models.WhatsappInstance, prospect_contact.whatsapp_instance_id)

    if not whatsapp_instance or not whatsapp_instance.instance_id:
        logger.warning(f"Contato {prospect_contact.id} não possui instância WhatsApp associada ou configurada.")
        # Retorna o histórico do DB para não perder o que já existe
        return json.loads(prospect_contact.conversa) if prospect_contact.conversa else []

    logger.info(f"Iniciando sincronização de histórico para o contato de prospecção ID {prospect_contact.id}...")
    try:
        db_history = json.loads(prospect_contact.conversa) if prospect_contact.conversa else []
    except (json.JSONDecodeError, TypeError):
        db_history = []
    
    clean_db_history = [msg for msg in db_history if 'id' in msg and not str(msg['id']).startswith(('sent_', 'internal_'))]
    if len(db_history) > len(clean_db_history):
        logger.info(f"Removendo/reprocessando {len(db_history) - len(clean_db_history)} mensagens temporárias ou sem ID.")
    
    processed_message_ids = {msg['id'] for msg in clean_db_history}
    contact_details = await crud_prospect.get_contact_details_from_prospect_contact(db, prospect_contact.id)

    # --- Lógica de JID ---
    target_jids = []
    if prospect_contact.jid_options:
        # jid_options agora é uma string separada por vírgulas
        target_jids = [jid.strip() for jid in prospect_contact.jid_options.split(',') if jid.strip()]
    
    if not target_jids:
        # Tenta buscar na API
        logger.info(f"JIDs não encontrados para o contato {contact_details.whatsapp}. Verificando na API...")
        try:
            check_result = await whatsapp_service.check_whatsapp_numbers(whatsapp_instance.instance_name, [contact_details.whatsapp])
            if check_result and isinstance(check_result, list) and len(check_result) > 0:
                first_result = check_result[0]
                if first_result.get("exists"):
                    found_jid = first_result.get("jid")
                    
                    # Busca jidOptions no banco da Evolution usando o JID encontrado
                    db_jid_options = await whatsapp_service.get_jid_options_from_db(whatsapp_instance.instance_name, found_jid)
                    
                    if db_jid_options:
                        # Converte a lista de dicts para string CSV
                        jid_list = [item.get("jid") for item in db_jid_options if isinstance(item, dict) and item.get("jid")]
                        jid_options_str = ",".join(jid_list)
                        await crud_prospect.update_prospect_contact(
                            db, 
                            pc_id=prospect_contact.id, 
                            situacao=None, 
                            jid_options=jid_options_str
                        )
                        target_jids = jid_list
                        logger.info(f"JIDs encontrados no DB da Evolution e salvos: {target_jids}")
                    else:
                        # Fallback: Se não encontrar no DB, usa o JID retornado pela API
                        target_jids = [found_jid]
                        logger.warning(f"jidOptions não encontrado no DB para {found_jid}. Usando JID da API.")
        except Exception as e:
            logger.error(f"Erro ao verificar número no WhatsApp: {e}")

    # CORREÇÃO: A rota findMessages da Evolution usa o NOME da instância, não o ID.
    raw_history_api = await whatsapp_service.fetch_chat_history(
        instance_name=whatsapp_instance.instance_name, 
        number=contact_details.whatsapp, 
        count=999, 
        mode=None,
        jids=target_jids,
        evolution_instance_id=whatsapp_instance.instance_id
    )

    if not raw_history_api:
        logger.warning("Não foi possível buscar o histórico da API. Tentando fallback de LID...")
        
        lid_found = None
        # Filtra mensagens da IA que tenham conteúdo de texto significativo (evita 'Oi', 'Olá')
        # Usa db_history para incluir mensagens que talvez ainda estejam com ID temporário 'sent_'
        ai_messages = [
            msg for msg in db_history 
            if msg.get('role') == 'assistant' and msg.get('content') and len(str(msg.get('content'))) > 5
        ]
        
        # Itera do mais recente para o mais antigo
        for msg in reversed(ai_messages):
            content = msg.get('content')
            found_jid = await whatsapp_service.find_lid_by_message_content(whatsapp_instance.instance_name, content)
            if found_jid:
                lid_found = found_jid
                logger.info(f"Fallback LID: Encontrado {lid_found} através da mensagem '{content[:20]}...'")
                break
        
        if lid_found:
            # Atualiza jid_options e tenta de novo
            current_jids = []
            if prospect_contact.jid_options:
                current_jids = [j.strip() for j in prospect_contact.jid_options.split(',') if j.strip()]
            
            if lid_found not in current_jids:
                current_jids.append(lid_found)
                new_jid_options = ",".join(current_jids)
                
                await crud_prospect.update_prospect_contact(
                    db, 
                    pc_id=prospect_contact.id, 
                    situacao=None, 
                    jid_options=new_jid_options
                )
                
                target_jids = current_jids # Atualiza a lista usada na busca
                
                logger.info(f"Tentando buscar histórico novamente com novo LID {lid_found}...")
                raw_history_api = await whatsapp_service.fetch_chat_history(
                    instance_name=whatsapp_instance.instance_name, 
                    number=contact_details.whatsapp, 
                    count=999, 
                    mode=None,
                    jids=target_jids,
                    evolution_instance_id=whatsapp_instance.instance_id
                )

    if not raw_history_api:
        logger.warning("Não foi possível buscar o histórico da API. Verifique a instância da Evolution API.")
        if len(db_history) > len(clean_db_history):
            await crud_prospect.update_prospect_contact_conversation(db, prospect_contact.id, json.dumps(clean_db_history))
        return clean_db_history

    newly_processed_messages = []
    total_tokens_used = 0
    for raw_msg in reversed(raw_history_api):
        # Adiciona uma verificação para garantir que a mensagem é um dicionário.
        # A API da Evolution pode retornar um JSON string em vez de um objeto.
        if isinstance(raw_msg, str):
            try:
                raw_msg = json.loads(raw_msg)
            except json.JSONDecodeError:
                logger.warning(f"Não foi possível decodificar a mensagem da API: {raw_msg}")
                continue
        msg_id = raw_msg.get("key", {}).get("id")
        if msg_id and msg_id not in processed_message_ids:
            # --- CORREÇÃO: Atualizar o contexto a cada iteração ---
            # O histórico de contexto (`current_context_history`) deve ser a soma do que já estava no banco
            # com as mensagens que acabaram de ser processadas NESTA sincronização.
            # Isso garante que, se houver dois áudios seguidos, a análise do segundo
            # já terá o texto transcrito do primeiro como contexto.
            current_context_history = clean_db_history + newly_processed_messages # A lista `newly_processed_messages` cresce a cada iteração.
            
            processed_msg, tokens_used = await _process_raw_message(
                raw_msg, current_context_history, whatsapp_instance.instance_name, persona_config, whatsapp_service, gemini_service, db, user
            )
            if processed_msg: 
                newly_processed_messages.append(processed_msg)
                total_tokens_used += tokens_used
    
    if newly_processed_messages:
        updated_history = clean_db_history + newly_processed_messages
        # Garante a ordem cronológica correta, usando um valor padrão para mensagens antigas sem timestamp
        updated_history.sort(key=_get_sort_key)

        logger.info(f"Sincronização: {len(newly_processed_messages)} mensagens novas/corrigidas processadas. Tokens: {total_tokens_used}")
        await crud_prospect.update_prospect_contact_conversation(
            db, 
            prospect_contact.id, 
            json.dumps(updated_history),
            tokens_to_add=total_tokens_used
        )
        return updated_history
    else:
        logger.info(f"Sincronização concluída. Nenhuma alteração no histórico.")
        # Garante a ordem mesmo que não haja mensagens novas
        clean_db_history.sort(key=_get_sort_key)
        return clean_db_history

@router.get("/whatsapp/destinations/{instance_id}", summary="Listar contatos e grupos do WhatsApp para notificação")
async def list_whatsapp_destinations(
    instance_id: int,
    current_user: models.User = Depends(dependencies.get_current_active_user),
    whatsapp_service: WhatsAppService = Depends(get_whatsapp_service),
    db: AsyncSession = Depends(get_db)
):
    instance = await crud_user.get_whatsapp_instance(db, instance_id, current_user.id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instância não encontrada.")
    
    if not instance.instance_name:
        return []
    
    # Busca contatos e grupos em paralelo
    contacts_task = whatsapp_service.find_contacts(instance.instance_name)
    groups_task = whatsapp_service.fetch_all_groups(instance.instance_name)
    
    results = await asyncio.gather(contacts_task, groups_task, return_exceptions=True)
    
    contacts = results[0] if isinstance(results[0], list) else []
    groups = results[1] if isinstance(results[1], list) else []
    
    formatted_destinations = []
    
    for c in contacts:
        jid = c.get("id")
        name = c.get("name") or c.get("pushName") or c.get("verifiedName") or jid
        if jid:
            formatted_destinations.append({"id": jid, "name": name, "type": "contact"})
            
    for g in groups:
        jid = g.get("id")
        subject = g.get("subject") or "Grupo sem nome"
        if jid:
            formatted_destinations.append({"id": jid, "name": subject, "type": "group"})
            
    return formatted_destinations

@router.get("/messages/{message_id}/media/{instance_id}", summary="Obter mídia de uma mensagem")
async def get_message_media(
    message_id: str,
    instance_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user)
):
    whatsapp = get_whatsapp_service()
    
    # Tenta extrair o ID numérico se vier no formato "ID-JID" (ex: 4-5545...)
    try:
        if "-" in instance_id:
            actual_id = int(instance_id.split("-")[0])
        else:
            actual_id = int(instance_id)
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="ID da instância inválido")

    instance = await crud_user.get_whatsapp_instance(db, actual_id, current_user.id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instância não encontrada.")
    if not instance.instance_name:
        raise HTTPException(status_code=400, detail="Instância sem nome configurado.")
    
    media_data = await whatsapp.get_media_by_message_id(instance.instance_name, message_id)
    if not media_data or not media_data.get("base64"):
        raise HTTPException(status_code=404, detail="Mídia não encontrada ou expirada.")
    
    try:
        media_bytes = base64.b64decode(media_data["base64"])
        return Response(content=media_bytes, media_type=media_data.get("mimetype", "application/octet-stream"))
    except Exception as e:
        logger.error(f"Erro ao decodificar base64: {e}")
        raise HTTPException(status_code=500, detail="Erro ao processar mídia")

@router.get("/contacts/", response_model=schemas.ProspectContactList, summary="Listar todos os contatos de prospecção")
async def list_all_prospect_contacts(
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user),
    search: Optional[str] = Query(None),
    status: Optional[List[str]] = Query(None),
    limit: int = Query(20),
    time_start: Optional[str] = Query(None),
    time_end: Optional[str] = Query(None),
    tags: Optional[str] = Query(None)
):
    start_date = datetime.fromisoformat(time_start) if time_start else None
    end_date = datetime.fromisoformat(time_end) if time_end else None
    
    items, total = await crud_prospect.get_all_prospect_contacts(
        db, current_user.id, search, status, limit, start_date, end_date, tags
    )
    return {"items": items, "total": total}

@router.get("/contacts/{pc_id}/media/{message_id}")
async def get_contact_media_by_pc(
    pc_id: int,
    message_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user),
    whatsapp_service: WhatsAppService = Depends(get_whatsapp_service)
):
    pc = await crud_prospect.get_prospect_contact_by_id(db, pc_id)
    if not pc: raise HTTPException(status_code=404, detail="Contato não encontrado")
    
    prospect = await db.get(models.Prospect, pc.prospect_id)
    if prospect.user_id != current_user.id: raise HTTPException(status_code=403, detail="Acesso negado")

    instance_id = pc.whatsapp_instance_id or (prospect.whatsapp_instance_ids[0] if prospect.whatsapp_instance_ids else None)
    if not instance_id: raise HTTPException(status_code=400, detail="Instância não encontrada")
    
    instance = await db.get(models.WhatsappInstance, instance_id)
    media_data = await whatsapp_service.get_media_by_message_id(instance.instance_name, message_id)
    
    if not media_data or not media_data.get("base64"): 
        raise HTTPException(status_code=404, detail="Mídia não encontrada")
    
    media_bytes = base64.b64decode(media_data["base64"])
    return Response(content=media_bytes, media_type=media_data.get("mimetype", "application/octet-stream"))

@router.post("/contacts/{pc_id}/send_message")
async def send_manual_message(
    pc_id: int,
    payload: Dict[str, str] = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user),
    whatsapp_service: WhatsAppService = Depends(get_whatsapp_service)
):
    text = payload.get("text")
    if not text: raise HTTPException(status_code=400, detail="Texto é obrigatório")

    pc = await crud_prospect.get_prospect_contact_by_id(db, pc_id)
    if not pc: raise HTTPException(status_code=404, detail="Contato não encontrado")
    
    prospect = await db.get(models.Prospect, pc.prospect_id)
    if prospect.user_id != current_user.id: raise HTTPException(status_code=403, detail="Acesso negado")

    instance_id = pc.whatsapp_instance_id or (prospect.whatsapp_instance_ids[0] if prospect.whatsapp_instance_ids else None)
    instance = await db.get(models.WhatsappInstance, instance_id)
    contact = await db.get(models.Contact, pc.contact_id)
    
    await whatsapp_service.send_text_message(instance.instance_name, contact.whatsapp, text)
    
    history = json.loads(pc.conversa) if pc.conversa else []
    now_iso = datetime.now(timezone.utc).isoformat()
    history.append({"id": f"manual_{now_iso}", "role": "assistant", "content": text, "timestamp": now_iso})
    
    pc.conversa = json.dumps(history)
    pc.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(pc)
    
    items, _ = await crud_prospect.get_all_prospect_contacts(db, current_user.id, search=contact.whatsapp)
    return items[0] if items else {}

@router.post("/contacts/{pc_id}/send_media")
async def send_manual_media(
    pc_id: int,
    file: UploadFile = File(...),
    type: str = Form(...),
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user),
    whatsapp_service: WhatsAppService = Depends(get_whatsapp_service)
):
    pc = await crud_prospect.get_prospect_contact_by_id(db, pc_id)
    if not pc: raise HTTPException(status_code=404, detail="Contato não encontrado")
    
    prospect = await db.get(models.Prospect, pc.prospect_id)
    if prospect.user_id != current_user.id: raise HTTPException(status_code=403, detail="Acesso negado")

    instance_id = pc.whatsapp_instance_id or (prospect.whatsapp_instance_ids[0] if prospect.whatsapp_instance_ids else None)
    instance = await db.get(models.WhatsappInstance, instance_id)
    contact = await db.get(models.Contact, pc.contact_id)

    contents = await file.read()
    base64_data = base64.b64encode(contents).decode('utf-8')
    mime_type = file.content_type
    
    media_type = 'document'
    if 'image' in mime_type: media_type = 'image'
    elif 'video' in mime_type: media_type = 'video'
    elif 'audio' in mime_type: media_type = 'audio'

    await whatsapp_service.send_media_message(
        instance.instance_name, contact.whatsapp, base64_data, media_type, mime_type, file_name=file.filename
    )
    
    history = json.loads(pc.conversa) if pc.conversa else []
    now_iso = datetime.now(timezone.utc).isoformat()
    history.append({
        "id": f"manual_media_{now_iso}", "role": "assistant", 
        "content": f"[{media_type.capitalize()} enviado: {file.filename}]", 
        "timestamp": now_iso, "type": media_type, "filename": file.filename
    })
    
    pc.conversa = json.dumps(history)
    pc.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(pc)
    
    items, _ = await crud_prospect.get_all_prospect_contacts(db, current_user.id, search=contact.whatsapp)
    return items[0] if items else {}

@router.get("/", response_model=List[Prospect], summary="Listar prospecções do usuário")
async def get_prospects(db: AsyncSession = Depends(get_db), current_user: models.User = Depends(dependencies.get_current_active_user)):
    return await crud_prospect.get_prospects_by_user(db, user_id=current_user.id)

@router.post("/", response_model=Prospect, status_code=201)
async def create_prospect(prospect_data: ProspectCreate, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(dependencies.get_current_active_user)):
    return await crud_prospect.create_prospect(db, prospect_in=prospect_data, user_id=current_user.id)

@router.get("/{prospect_id}/activity-log", response_model=List[schemas.ProspectActivityLog], summary="Obter o log de atividades de uma prospecção")
async def get_prospect_activity_log(prospect_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(dependencies.get_current_active_user)):
    prospect = await crud_prospect.get_prospect(db, prospect_id=prospect_id, user_id=current_user.id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospecção não encontrada.")

    contacts_with_details = await crud_prospect.get_prospect_contacts_with_details(db, prospect_id=prospect_id)
    
    # Ordena pela data de atualização mais recente
    sorted_contacts = sorted(contacts_with_details, key=lambda item: item.ProspectContact.updated_at, reverse=True)

    activity_log = [
        schemas.ProspectActivityLog(
            prospect_contact_id=item.ProspectContact.id, # <-- CORREÇÃO: Adicionado o ID da relação
            contact_id=item.ProspectContact.contact_id, # <-- CORREÇÃO: Adicionado o ID do contato
            contact_name=item.Contact.nome,
            contact_whatsapp=item.Contact.whatsapp,
            situacao=item.ProspectContact.situacao,
            observacoes=item.ProspectContact.observacoes,
            updated_at=item.ProspectContact.updated_at,
            conversa=item.ProspectContact.conversa
        ) for item in sorted_contacts
    ]
    return activity_log

@router.post("/{prospect_id}/start", summary="Iniciar uma prospecção")
async def start_prospecting(prospect_id: int, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(dependencies.get_current_active_user)):
    prospect = await crud_prospect.get_prospect(db, prospect_id=prospect_id, user_id=current_user.id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospecção não encontrada.")
    if prospect.status == "Em Andamento":
        raise HTTPException(status_code=409, detail="Esta prospecção já está em andamento.")
    
    await crud_prospect.update_prospect(db, db_prospect=prospect, prospect_in=ProspectUpdate(status="Em Andamento"))
    return {"message": "Campanha iniciada. O worker irá processá-la em breve."}

@router.post("/{prospect_id}/stop", summary="Parar uma prospecção")
async def stop_prospecting(prospect_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(dependencies.get_current_active_user)):
    prospect = await crud_prospect.get_prospect(db, prospect_id=prospect_id, user_id=current_user.id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospecção não encontrada.")
    
    # Altera para "Pausado" em vez de "Parado" para indicar que pode ser retomada.
    if prospect.status not in ["Em Andamento", "Falha"]:
        raise HTTPException(status_code=400, detail=f"A campanha não está ativa. Status atual: '{prospect.status}'.")
    
    prospect_update = ProspectUpdate(status="Pausado")
    await crud_prospect.update_prospect(db, db_prospect=prospect, prospect_in=prospect_update)
    return {"message": "Campanha pausada. O worker irá parar de processá-la."}

@router.put("/{prospect_id}", response_model=Prospect, summary="Atualizar uma prospecção")
async def edit_prospect(prospect_id: int, prospect_in: ProspectUpdate, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(dependencies.get_current_active_user)):
    db_prospect = await crud_prospect.get_prospect(db, prospect_id=prospect_id, user_id=current_user.id)
    if not db_prospect:
        raise HTTPException(status_code=404, detail="Prospecção não encontrada.")
    if db_prospect.status == "Em Andamento":
        raise HTTPException(status_code=400, detail="Não é possível editar uma campanha em andamento. Pare-a primeiro.")
    
    updated_prospect = await crud_prospect.update_prospect_and_add_contacts(db, prospect=db_prospect, update_data=prospect_in)
    return updated_prospect

@router.delete("/{prospect_id}", summary="Excluir uma prospecção")
async def delete_prospect(prospect_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(dependencies.get_current_active_user)):
    prospect = await crud_prospect.get_prospect(db, prospect_id=prospect_id, user_id=current_user.id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospecção não encontrada.")

    if prospect.status == "Em Andamento":
        raise HTTPException(
            status_code=400, 
            detail="Não é possível excluir uma campanha que está em andamento. Pare a campanha primeiro."
        )

    await crud_prospect.delete_prospect(db, prospect_to_delete=prospect)
    
    return {"detail": "Campanha de prospecção excluída com sucesso."}

@router.get("/sheet/{prospect_id}", response_model=Dict[str, Any], summary="Obter dados de uma campanha")
async def get_prospecting_sheet_data(prospect_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(dependencies.get_current_active_user)):
    prospect = await crud_prospect.get_prospect(db, prospect_id=prospect_id, user_id=current_user.id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Campanha não encontrada.")
    
    contacts_data = await crud_prospect.get_prospect_contacts_with_details(db, prospect_id=prospect_id)
    headers = ["id", "nome", "whatsapp", "situacao", "observacoes", "conversa", "lead_score"]
    data_rows = []
    for item in contacts_data:
        data_rows.append({
            "id": item.ProspectContact.id, 
            "nome": item.Contact.nome, 
            "whatsapp": item.Contact.whatsapp, 
            "situacao": item.ProspectContact.situacao, 
            "observacoes": item.ProspectContact.observacoes, 
            "conversa": item.ProspectContact.conversa,
            "lead_score": item.ProspectContact.lead_score
        })
    return {"headers": headers, "data": data_rows, "prospect_name": prospect.nome_prospeccao}

@router.get("/{prospect_id}/export/csv", summary="Exportar dados da campanha para CSV")
async def export_prospect_csv(
    prospect_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user)
):
    prospect = await crud_prospect.get_prospect(db, prospect_id=prospect_id, user_id=current_user.id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Campanha não encontrada.")

    contacts_data = await crud_prospect.get_prospect_contacts_with_details(db, prospect_id=prospect_id)
    
    output = io.StringIO()
    # Usando ponto e vírgula para melhor compatibilidade com Excel em PT-BR
    writer = csv.writer(output, delimiter=';')
    writer.writerow(["ID", "Nome", "WhatsApp", "Situação", "Lead Score", "Observações", "Conversa"])

    for item in contacts_data:
        pc = item.ProspectContact
        contact = item.Contact
        
        # Formata a conversa para um layout amigável
        formatted_conversa = ""
        try:
            conversa_json = json.loads(pc.conversa) if pc.conversa else []
            lines = []
            for msg in conversa_json:
                role = "IA" if msg.get("role") == "assistant" else "Contato"
                content = msg.get("content", "")
                timestamp_str = ""
                if msg.get("timestamp"):
                    try:
                        dt = datetime.fromisoformat(msg["timestamp"].replace('Z', '+00:00'))
                        timestamp_str = dt.strftime("%d/%m/%Y %H:%M")
                    except Exception:
                        timestamp_str = msg["timestamp"]
                
                prefix = f"[{timestamp_str}] " if timestamp_str else ""
                lines.append(f"{prefix}{role}: {content}")
            
            formatted_conversa = "\n".join(lines)
        except Exception:
            formatted_conversa = pc.conversa

        writer.writerow([pc.id, contact.nome, contact.whatsapp, pc.situacao, pc.lead_score or 0, pc.observacoes or "", formatted_conversa])

    output.seek(0)
    # utf-8-sig adiciona o BOM para o Excel reconhecer a codificação automaticamente
    content = output.getvalue().encode('utf-8-sig')
    filename = f"prospeccao_{prospect.nome_prospeccao.replace(' ', '_')}.csv"
    return StreamingResponse(
        io.BytesIO(content),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.put("/contacts/{prospect_contact_id}", summary="Atualizar um contato em uma prospecção")
async def update_prospect_contact_details(
    prospect_contact_id: int, 
    contact_in: ProspectContactUpdate, 
    db: AsyncSession = Depends(get_db), 
    current_user: models.User = Depends(dependencies.get_current_active_user)
):
    db_prospect_contact = await crud_prospect.get_prospect_contact_by_id(db, prospect_contact_id=prospect_contact_id)
    
    if not db_prospect_contact:
        raise HTTPException(status_code=404, detail="Contato da prospecção não encontrado.")
    
    db_prospect = await crud_prospect.get_prospect(db, prospect_id=db_prospect_contact.prospect_id, user_id=current_user.id)
    if not db_prospect:
        raise HTTPException(status_code=403, detail="Acesso negado.")

    await crud_prospect.update_prospect_contact(
        db, 
        pc_id=prospect_contact_id, 
        situacao=contact_in.situacao, 
        observacoes=contact_in.observacoes,
        jid_options=contact_in.jid_options
    )
    return {"detail": "Contato atualizado com sucesso."}


@router.delete("/contacts/{prospect_contact_id}", summary="Remover um contato de uma prospecção")
async def delete_prospect_contact_from_campaign(
    prospect_contact_id: int, 
    db: AsyncSession = Depends(get_db), 
    current_user: models.User = Depends(dependencies.get_current_active_user)
):
    db_prospect_contact = await crud_prospect.get_prospect_contact_by_id(db, prospect_contact_id=prospect_contact_id)
    
    if not db_prospect_contact:
        raise HTTPException(status_code=404, detail="Contato da prospecção não encontrado.")
        
    db_prospect = await crud_prospect.get_prospect(db, prospect_id=db_prospect_contact.prospect_id, user_id=current_user.id)
    if not db_prospect:
        raise HTTPException(status_code=403, detail="Acesso negado.")

    await crud_prospect.delete_prospect_contact(db, prospect_contact_to_delete=db_prospect_contact)
    return {"detail": "Contato removido da campanha com sucesso."}
