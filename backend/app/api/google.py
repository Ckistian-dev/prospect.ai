from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import JSONResponse

from app.api import dependencies
from app.crud import crud_user, crud_contact
from app.db import models
from app.db.database import get_db
from app.db.schemas import UserUpdate
from app.services.google_contacts_service import GoogleContactsService

router = APIRouter()

@router.get("/auth/url", summary="Obter URL de autorização do Google")
def get_google_auth_url(
    redirect_uri: str = Query(..., description="A URL de callback do frontend para onde o Google deve redirecionar."),
    instance_id: int = Query(..., description="ID da instância do WhatsApp"),
    current_user: models.User = Depends(dependencies.get_current_active_user)
):
    """Gera e retorna a URL para o usuário autorizar o acesso aos seus contatos."""
    service = GoogleContactsService(whatsapp_instance=None) # Instance not needed for URL generation
    # Passa a redirect_uri recebida do frontend para o serviço
    auth_url = service.get_authorization_url(redirect_uri=redirect_uri)
    return {"authorization_url": auth_url}

@router.post("/auth/callback", summary="Callback de autorização do Google")
async def google_auth_callback(
    code: str = Query(...),
    redirect_uri: str = Query(...),
    instance_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user),
):
    """
    Recebe o código do Google, troca por credenciais e as salva no usuário.
    É crucial que a redirect_uri aqui seja a mesma usada para gerar a URL de autorização.
    """
    instance = await crud_user.get_whatsapp_instance(db, instance_id, current_user.id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instância WhatsApp não encontrada.")

    service = GoogleContactsService(whatsapp_instance=instance)
    try:
        # Passa o código e a redirect_uri para obter o token
        credentials_dict = service.fetch_token(code=code, redirect_uri=redirect_uri)
        await crud_user.update_whatsapp_instance_credentials(db, instance, credentials_dict)
        return {"status": "success", "message": "Conta Google conectada com sucesso."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Falha ao obter token do Google: {e}")

@router.get("/{instance_id}/status", summary="Verificar status da conexão com Google")
async def get_google_connection_status(
    instance_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user),
):
    """Verifica se a instância atual tem credenciais do Google salvas."""
    instance = await crud_user.get_whatsapp_instance(db, instance_id, current_user.id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instância não encontrada.")
    is_connected = instance.google_credentials is not None
    return {"status": "connected" if is_connected else "disconnected"}

@router.post("/{instance_id}/disconnect", summary="Desconectar da conta Google")
async def disconnect_google_account(
    instance_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user),
):
    """Remove as credenciais do Google da instância."""
    instance = await crud_user.get_whatsapp_instance(db, instance_id, current_user.id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instância não encontrada.")
    
    await crud_user.update_whatsapp_instance_credentials(db, instance, None)
    return {"status": "disconnected", "message": "Conta Google desconectada."}

@router.post("/{instance_id}/sync", summary="Sincronizar todos os contatos manualmente")
async def sync_all_contacts(
    instance_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user),
):
    """Força a sincronização de todos os contatos do usuário com o Google Contacts."""
    instance = await crud_user.get_whatsapp_instance(db, instance_id, current_user.id)
    if not instance or not instance.google_credentials:
        raise HTTPException(status_code=400, detail="Instância não conectada a uma conta Google.")

    contacts = await crud_contact.get_contacts_by_user(db, user_id=current_user.id)
    if not contacts:
        return {"message": "Nenhum contato para sincronizar."}

    service = GoogleContactsService(whatsapp_instance=instance)
    result = await service.sync_multiple_contacts(contacts)

    return JSONResponse(content={
        "message": "Sincronização manual concluída.",
        "details": result
    })