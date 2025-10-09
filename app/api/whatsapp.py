from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any
import logging

from app.api import dependencies
from app.db.database import get_db
from app.db import models
from app.db.schemas import UserUpdate
from app.crud import crud_user
from app.services.whatsapp_service import WhatsAppService, get_whatsapp_service

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/instance", summary="Obter o nome da instância do usuário logado", response_model=Dict[str, str | None])
async def get_instance_name(
    current_user: models.User = Depends(dependencies.get_current_active_user)
):
    """Retorna o nome da instância salvo para o usuário logado."""
    return {"instance_name": current_user.instance_name}


@router.post("/instance", summary="Salvar o nome da instância para o usuário", response_model=Dict[str, Any])
async def set_instance_name(
    instance_name: str = Body(..., embed=True, description="O nome a ser salvo para a instância."),
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user)
):
    """Salva ou atualiza o nome da instância do WhatsApp no banco de dados para o usuário."""
    user_update_data = UserUpdate(instance_name=instance_name)
    await crud_user.update_user(db, db_user=current_user, user_in=user_update_data)
    return {"status": "success", "instance_name": instance_name}


# O endpoint /status volta a ser simples, pois ele não tem os dados para salvar o ID.
@router.get("/status", summary="Verificar status da conexão com o WhatsApp")
async def get_status(
    current_user: models.User = Depends(dependencies.get_current_active_user),
    whatsapp_service: WhatsAppService = Depends(get_whatsapp_service),
):
    """Verifica o status da conexão usando o nome da instância do usuário."""
    instance_name = current_user.instance_name
    if not instance_name:
        return {"status": "no_instance_name"}
    # Apenas retorna o status para o frontend, sem lógica de salvar
    result = await whatsapp_service.get_connection_status(instance_name)
    return result


# O endpoint /connect agora contém a lógica para salvar o ID.
@router.get("/connect", summary="Obter QR Code para conectar e salvar Instance ID")
async def connect(
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user),
    whatsapp_service: WhatsAppService = Depends(get_whatsapp_service),
):
    """Gera um QR Code, conecta a instância e salva o UUID da instância no banco de dados do usuário."""
    instance_name = current_user.instance_name
    if not instance_name:
        raise HTTPException(status_code=400, detail="Nome da instância não configurado. Salve-o primeiro.")
    
    result = await whatsapp_service.create_and_connect_instance(instance_name)
    
    if result.get("status") == "error":
        raise HTTPException(status_code=500, detail=result.get("detail"))

    # --- LÓGICA DE SALVAR O ID DE VOLTA AO LUGAR CERTO ---
    instance_data = result.get("instance")
    if result.get("status") == "qrcode" and instance_data:
        instance_id = instance_data.get("id") or instance_data.get("instanceId")
        if instance_id and instance_id != current_user.instance_id:
            logger.info(f"Instância criada/conectada. Salvando instance_id '{instance_id}' para o usuário {current_user.id}")
            user_update = UserUpdate(instance_id=instance_id)
            await crud_user.update_user(db, db_user=current_user, user_in=user_update)

    return result


@router.post("/disconnect", summary="Desconectar do WhatsApp")
async def disconnect(
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user),
    whatsapp_service: WhatsAppService = Depends(get_whatsapp_service),
):
    """Desconecta a instância do WhatsApp do usuário e limpa o instance_id."""
    instance_name = current_user.instance_name
    if not instance_name:
        raise HTTPException(status_code=400, detail="Nome da instância não configurado.")
    
    result = await whatsapp_service.disconnect_instance(instance_name)
    
    if result.get("status") == "error":
        raise HTTPException(status_code=500, detail=result.get("detail"))

    # Limpa o instance_id do usuário no banco de dados
    if current_user.instance_id:
        logger.info(f"Limpando instance_id para o usuário {current_user.id}")
        user_update = UserUpdate(instance_id=None)
        await crud_user.update_user(db, db_user=current_user, user_in=user_update)

    return result

