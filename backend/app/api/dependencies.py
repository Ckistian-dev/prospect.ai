from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.database import get_db
from app.db import models
from app.db.schemas import TokenData
from app.services.security import get_current_user_token_data as get_token_data
from app.crud import crud_user
from app.core.config import settings

async def get_current_active_user(
    token_data: TokenData = Depends(get_token_data),
    db: AsyncSession = Depends(get_db)
) -> models.User:
    """
    Dependência para obter o usuário completo do banco de dados
    a partir dos dados do token JWT. Levanta uma exceção se o usuário
    não for encontrado.
    """
    # Verifica se é o superusuário definido no .env
    admin_email = getattr(settings, "ADMIN_EMAIL", None)
    if admin_email and token_data.email == admin_email:
        # Retorna um objeto User "falso" para o admin, já que ele não está no banco
        return models.User(id=0, email=admin_email, instance_name="admin", tokens=999999)

    user = await crud_user.get_user_by_email(db, email=token_data.email)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    # Aqui você poderia adicionar uma verificação se o usuário está ativo,
    # se tivesse um campo 'is_active' no modelo.
    return user

async def get_current_active_superuser(
    current_user: models.User = Depends(get_current_active_user),
) -> models.User:
    admin_email = getattr(settings, "ADMIN_EMAIL", None)
    # Verifica se o email do usuário atual corresponde ao email de admin do .env
    if not admin_email or current_user.email != admin_email:
        raise HTTPException(
            status_code=400, detail="The user doesn't have enough privileges"
        )
    return current_user
