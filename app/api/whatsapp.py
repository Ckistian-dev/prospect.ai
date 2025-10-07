from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any

from app.api import dependencies
from app.db.database import get_db
from app.db import models
from app.db.schemas import UserUpdate
from app.crud import crud_user
from app.services.whatsapp_service import WhatsAppService, get_whatsapp_service

router = APIRouter()


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


@router.get("/status", summary="Verificar status da conexão com o WhatsApp")
async def get_status(
    current_user: models.User = Depends(dependencies.get_current_active_user),
    whatsapp_service: WhatsAppService = Depends(get_whatsapp_service),
):
    """Verifica o status da conexão usando o nome da instância do usuário."""
    instance_name = current_user.instance_name
    if not instance_name:
        return {"status": "no_instance_name"}
    # CORREÇÃO AQUI: Adicionado 'await'
    return await whatsapp_service.get_connection_status(instance_name)


@router.get("/connect", summary="Obter QR Code para conectar")
async def connect(
    current_user: models.User = Depends(dependencies.get_current_active_user),
    whatsapp_service: WhatsAppService = Depends(get_whatsapp_service),
):
    """Gera um QR Code para conectar a instância do usuário."""
    instance_name = current_user.instance_name
    if not instance_name:
        raise HTTPException(status_code=400, detail="Nome da instância não configurado. Salve-o primeiro.")
    # CORREÇÃO AQUI: Adicionado 'await'
    result = await whatsapp_service.create_and_connect_instance(instance_name)
    if result.get("status") == "error":
        raise HTTPException(status_code=500, detail=result.get("detail"))
    return result


@router.post("/disconnect", summary="Desconectar do WhatsApp")
async def disconnect(
    current_user: models.User = Depends(dependencies.get_current_active_user),
    whatsapp_service: WhatsAppService = Depends(get_whatsapp_service),
):
    """Desconecta a instância do WhatsApp do usuário."""
    instance_name = current_user.instance_name
    if not instance_name:
        raise HTTPException(status_code=400, detail="Nome da instância não configurado.")
    # CORREÇÃO AQUI: Adicionado 'await'
    result = await whatsapp_service.disconnect_instance(instance_name)
    if result.get("status") == "error":
        raise HTTPException(status_code=500, detail=result.get("detail"))
    return result

