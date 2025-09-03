from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.database import get_db
from app.db import models
from app.db.schemas import TokenData
from app.services.security_service import get_current_user as get_token_data
from app.crud import crud_user

async def get_current_active_user(
    token_data: TokenData = Depends(get_token_data),
    db: AsyncSession = Depends(get_db)
) -> models.User:
    """
    Dependência para obter o usuário completo do banco de dados
    a partir dos dados do token JWT. Levanta uma exceção se o usuário
    não for encontrado.
    """
    user = await crud_user.get_user_by_email(db, email=token_data.email)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    # Aqui você poderia adicionar uma verificação se o usuário está ativo,
    # se tivesse um campo 'is_active' no modelo.
    return user
