from fastapi import APIRouter, Depends, HTTPException, Query
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
    current_user: models.User = Depends(dependencies.get_current_active_user)
):
    """Gera e retorna a URL para o usuário autorizar o acesso aos seus contatos."""
    service = GoogleContactsService()
    auth_url = service.get_authorization_url()
    return {"authorization_url": auth_url}

@router.post("/auth/callback", summary="Callback de autorização do Google")
async def google_auth_callback(
    code: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user),
):
    """
    Recebe o código do Google, troca por credenciais e as salva no usuário.
    """
    service = GoogleContactsService()
    try:
        credentials_dict = service.fetch_token(code)
        user_update = UserUpdate(google_credentials=credentials_dict)
        await crud_user.update_user(db, db_obj=current_user, obj_in=user_update)
        return {"status": "success", "message": "Conta Google conectada com sucesso."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Falha ao obter token do Google: {e}")

@router.get("/status", summary="Verificar status da conexão com Google")
async def get_google_connection_status(
    current_user: models.User = Depends(dependencies.get_current_active_user),
):
    """Verifica se o usuário atual tem credenciais do Google salvas."""
    is_connected = current_user.google_credentials is not None
    return {"status": "connected" if is_connected else "disconnected"}

@router.post("/disconnect", summary="Desconectar da conta Google")
async def disconnect_google_account(
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user),
):
    """Remove as credenciais do Google do usuário."""
    user_update = UserUpdate(google_credentials=None)
    await crud_user.update_user(db, db_obj=current_user, obj_in=user_update)
    return {"status": "disconnected", "message": "Conta Google desconectada."}

@router.post("/sync", summary="Sincronizar todos os contatos manualmente")
async def sync_all_contacts(
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user),
):
    """Força a sincronização de todos os contatos do usuário com o Google Contacts."""
    if not current_user.google_credentials:
        raise HTTPException(status_code=400, detail="Usuário não está conectado a uma conta Google.")

    contacts = await crud_contact.get_contacts_by_user(db, user_id=current_user.id)
    if not contacts:
        return {"message": "Nenhum contato para sincronizar."}

    service = GoogleContactsService(user=current_user)
    result = service.sync_multiple_contacts(contacts)

    return JSONResponse(content={
        "message": "Sincronização manual concluída.",
        "details": result
    })