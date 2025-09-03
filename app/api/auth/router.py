from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import timedelta
from typing import Annotated

from app.db.schemas import Token, User
from app.crud import crud_user
from app.services import security_service
from app.core.config import settings
from app.db.database import get_db
from app.db import models
from app.api.dependencies import get_current_active_user

router = APIRouter()

@router.post("/token", response_model=Token)
async def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: AsyncSession = Depends(get_db)
):
    """
    Autentica o usuário e retorna um token de acesso JWT.
    """
    user = await crud_user.get_user_by_email(db, email=form_data.username)
    if not user or not security_service.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security_service.create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )

    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=User, summary="Obter dados do usuário logado")
def read_users_me(current_user: models.User = Depends(get_current_active_user)):
    """
    Retorna os detalhes completos do usuário atualmente autenticado.
    """
    return current_user
