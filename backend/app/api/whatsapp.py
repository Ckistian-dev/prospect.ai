from fastapi import APIRouter, Depends, HTTPException, Body, BackgroundTasks, Path
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any, List
import logging

from app.api import dependencies
from app.db.database import get_db, SessionLocal
from app.db import models, schemas
from app.crud import crud_user
from app.services.whatsapp_service import WhatsAppService, get_whatsapp_service

router = APIRouter()
logger = logging.getLogger(__name__)

async def run_check_messages(user_id: int, instance_id: int):
    """Função auxiliar para rodar a verificação em background com sessão própria."""
    from app.services.whatsapp_service import get_whatsapp_service
    
    whatsapp_service = get_whatsapp_service()
    
    async with SessionLocal() as db:
        instance = await crud_user.get_whatsapp_instance(db, instance_id, user_id)
        if instance:
            await whatsapp_service.check_prospect_messages(db, instance.owner)

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
