from fastapi import APIRouter, Depends, HTTPException, Body, BackgroundTasks, Path, Response, Query, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Dict, Any, List
import logging
import asyncio
import base64

from app.api import dependencies
from app.db.database import get_db, SessionLocal
from app.db import models, schemas
from app.crud import crud_user
from app.services.whatsapp_service import WhatsAppService, get_whatsapp_service

router = APIRouter()
logger = logging.getLogger(__name__)

async def run_check_messages(user_id: int, instance_id: int):
    """Função auxiliar para rodar a verificação em background com sessão própria."""
    # Aguarda 5 minutos conforme solicitado antes de iniciar a varredura
    await asyncio.sleep(300)
    
    from app.services.whatsapp_service import get_whatsapp_service
    
    whatsapp_service = get_whatsapp_service()
    
    async with SessionLocal() as db:
        instance = await crud_user.get_whatsapp_instance(db, instance_id, user_id)
        if instance:
            await whatsapp_service.check_prospect_messages(db, instance.owner, instance_id=instance.id)

@router.get("/", summary="Listar instâncias do WhatsApp", response_model=List[schemas.WhatsappInstance])
async def list_instances(
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user)
):
    instances = await crud_user.get_whatsapp_instances(db, current_user.id)
    result = []
    for inst in instances:
        schema_inst = schemas.WhatsappInstance.model_validate(inst)
        schema_inst.is_google_connected = inst.google_credentials is not None
        result.append(schema_inst)
    return result

@router.post("/", summary="Criar nova instância do WhatsApp", response_model=schemas.WhatsappInstance)
async def create_instance(
    instance_in: schemas.WhatsappInstanceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user)
):
    existing = await crud_user.get_whatsapp_instance_by_name(db, instance_in.instance_name)
    if existing:
        raise HTTPException(status_code=400, detail="Nome da instância já existe.")
    
    instance = await crud_user.create_whatsapp_instance(db, instance_in, current_user.id)
    schema_inst = schemas.WhatsappInstance.model_validate(instance)
    schema_inst.is_google_connected = False
    return schema_inst

@router.get("/{instance_id}/status", summary="Verificar status da conexão com o WhatsApp")
async def get_status(
    instance_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user),
    whatsapp_service: WhatsAppService = Depends(get_whatsapp_service),
):
    instance = await crud_user.get_whatsapp_instance(db, instance_id, current_user.id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instância não encontrada.")
    
    result = await whatsapp_service.get_connection_status(instance.instance_name)
    
    if result.get("status") == "connected":
        # Busca detalhes adicionais para garantir que temos o número conectado
        instance_data = await whatsapp_service.fetch_instance(instance.instance_name)
        owner = instance_data.get("owner") or instance_data.get("ownerJid")
        if owner:
            number = owner.split("@")[0]
            if getattr(instance, "number", None) != number:
                instance.number = number
                await db.commit()

    return result

@router.get("/{instance_id}/connect", summary="Obter QR Code para conectar e salvar Instance ID")
async def connect(
    instance_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user),
    whatsapp_service: WhatsAppService = Depends(get_whatsapp_service),
):
    instance = await crud_user.get_whatsapp_instance(db, instance_id, current_user.id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instância não encontrada.")
    
    result = await whatsapp_service.create_and_connect_instance(instance.instance_name)
    
    if result.get("status") == "error":
        raise HTTPException(status_code=500, detail=result.get("detail", "Erro desconhecido ao conectar."))

    instance_data = result.get("instance")
    if result.get("status") == "qrcode" and instance_data:
        evo_instance_id = instance_data.get("id") or instance_data.get("instanceId")
        if evo_instance_id and evo_instance_id != instance.instance_id:
            logger.info(f"Instância criada/conectada. Salvando instance_id '{evo_instance_id}' para a instância {instance.id}")
            instance.instance_id = evo_instance_id
            await db.commit()

    if result.get("status") == "connected":
        # Busca detalhes adicionais para garantir que temos o número conectado
        instance_data = await whatsapp_service.fetch_instance(instance.instance_name)
        owner = instance_data.get("owner") or instance_data.get("ownerJid")
        if owner:
            number = owner.split("@")[0]
            if getattr(instance, "number", None) != number:
                instance.number = number
                await db.commit()
        background_tasks.add_task(run_check_messages, current_user.id, instance.id)

    return result

@router.post("/{instance_id}/disconnect", summary="Desconectar do WhatsApp")
async def disconnect(
    instance_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user),
    whatsapp_service: WhatsAppService = Depends(get_whatsapp_service),
):
    instance = await crud_user.get_whatsapp_instance(db, instance_id, current_user.id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instância não encontrada.")
    
    result = await whatsapp_service.delete_instance(instance.instance_name)
    
    if result.get("status") == "error":
        raise HTTPException(status_code=500, detail=result.get("detail"))

    if instance.instance_id:
        logger.info(f"Limpando instance_id para a instância {instance.id}")
        instance.instance_id = None
        await db.commit()

    return result

@router.put("/{instance_id}", summary="Atualizar instância", response_model=schemas.WhatsappInstance)
async def update_instance(
    instance_id: int,
    instance_in: schemas.WhatsappInstanceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user)
):
    instance = await crud_user.get_whatsapp_instance(db, instance_id, current_user.id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instância não encontrada.")
    
    updated = await crud_user.update_whatsapp_instance(db, instance, instance_in)
    schema_inst = schemas.WhatsappInstance.model_validate(updated)
    schema_inst.is_google_connected = updated.google_credentials is not None
    return schema_inst

@router.delete("/{instance_id}", summary="Excluir instância")
async def delete_instance(
    instance_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user),
    whatsapp_service: WhatsAppService = Depends(get_whatsapp_service)
):
    instance = await crud_user.get_whatsapp_instance(db, instance_id, current_user.id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instância não encontrada.")
    
    # Tenta deletar na Evolution também
    await whatsapp_service.delete_instance(instance.instance_name)
    
    await crud_user.delete_whatsapp_instance(db, instance)
    return {"status": "deleted"}

@router.get("/{instance_id}/chats", summary="Listar conversas da instância (Evolution DB)")
async def list_instance_chats(
    instance_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user),
    whatsapp_service: WhatsAppService = Depends(get_whatsapp_service),
    limit: int = Query(100, description="Limite de conversas a retornar"),
):
    instance = await crud_user.get_whatsapp_instance(db, instance_id, current_user.id)
    if not instance or not instance.instance_id:
        raise HTTPException(status_code=404, detail="Instância não encontrada ou não inicializada.")
    
    # Agora o fetch_chats cuida de toda a lógica de correlação e enriquecimento
    return await whatsapp_service.fetch_chats(
        instance.instance_id, 
        limit=limit, 
        db=db, 
        user_id=current_user.id
    )

@router.get("/{instance_id}/messages/{remote_jid}", summary="Obter histórico de mensagens de um JID (Evolution DB)")
async def get_chat_messages(
    instance_id: int,
    remote_jid: str,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user),
    whatsapp_service: WhatsAppService = Depends(get_whatsapp_service),
):
    instance = await crud_user.get_whatsapp_instance(db, instance_id, current_user.id)
    if not instance or not instance.instance_id:
        raise HTTPException(status_code=404, detail="Instância não encontrada.")
    
    # Busca JIDs relacionados (jidOptions) antes de buscar o histórico
    all_jids = await whatsapp_service.get_all_jids_for_contact(remote_jid)
    
    raw_messages = await whatsapp_service.fetch_chat_history(
        instance_name=instance.instance_name,
        number="",
        jids=all_jids,
        evolution_instance_id=instance.instance_id
    )
    
    return [whatsapp_service.format_evolution_message(m) for m in reversed(raw_messages)]

@router.post("/{instance_id}/send", summary="Enviar mensagem manual (Evolution API)")
async def send_message(
    instance_id: int,
    payload: Dict[str, Any] = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user),
    whatsapp_service: WhatsAppService = Depends(get_whatsapp_service),
):
    instance = await crud_user.get_whatsapp_instance(db, instance_id, current_user.id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instância não encontrada.")
    
    remote_jid = payload.get("remoteJid")
    text = payload.get("text")
    
    if not remote_jid or not text:
        raise HTTPException(status_code=400, detail="remoteJid e text são obrigatórios.")
    
    result = await whatsapp_service.send_text_message(instance.instance_name, remote_jid, text)
    return result

@router.get("/{instance_id}/media/{message_id}", summary="Obter mídia de uma mensagem (Evolution API)")
async def get_whatsapp_media(
    instance_id: str,
    message_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user),
    whatsapp_service: WhatsAppService = Depends(get_whatsapp_service)
):
    # Tenta extrair o ID numérico se vier no formato "ID-JID" (ex: 4-5545...)
    try:
        if "-" in instance_id:
            actual_id = int(instance_id.split("-")[0])
        else:
            actual_id = int(instance_id)
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="ID da instância inválido")

    instance = await crud_user.get_whatsapp_instance(db, actual_id, current_user.id)
    if not instance: raise HTTPException(status_code=404, detail="Instância não encontrada")
    
    media_data = await whatsapp_service.get_media_by_message_id(instance.instance_name, message_id)
    if not media_data or not media_data.get("base64"): 
        raise HTTPException(status_code=404, detail="Mídia não encontrada")
    
    try:
        media_bytes = base64.b64decode(media_data["base64"])
        return Response(content=media_bytes, media_type=media_data.get("mimetype", "application/octet-stream"))
    except Exception:
        raise HTTPException(status_code=500, detail="Erro ao processar mídia")

@router.post("/{instance_id}/send-media", summary="Enviar mídia (Evolution API)")
async def send_whatsapp_media(
    instance_id: int,
    file: UploadFile = File(...),
    remoteJid: str = Form(...),
    mediaType: str = Form(...),
    caption: str = Form(""),
    delay: int = Form(0),
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user),
    whatsapp_service: WhatsAppService = Depends(get_whatsapp_service),
):
    instance = await crud_user.get_whatsapp_instance(db, instance_id, current_user.id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instância não encontrada.")
    
    file_content = await file.read()
    base64_content = base64.b64encode(file_content).decode("utf-8")
    
    if mediaType == "audio":
        # Usa o endpoint específico para áudio (PTT) conforme documentação
        result = await whatsapp_service.send_whatsapp_audio(
            instance.instance_name, 
            remoteJid, 
            base64_content,
            delay=delay
        )
    else:
        # Usa o endpoint genérico de mídia
        result = await whatsapp_service.send_media_message(
            instance.instance_name,
            remoteJid,
            base64_content,
            mediaType,
            file.content_type,
            file_name=file.filename,
            caption=caption,
            delay=delay
        )
    
    return result
