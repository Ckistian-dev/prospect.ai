from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.db.database import get_db
from app.db import models
from app.db.schemas import Config, ConfigCreate, ConfigUpdate
from app.crud import crud_config
from app.api.dependencies import get_current_active_user

router = APIRouter()

@router.post("/", response_model=Config, status_code=status.HTTP_201_CREATED)
async def create_config(
    config: ConfigCreate,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """Cria uma nova configuração para o usuário logado."""
    return await crud_config.create_config(db=db, config=config, user_id=current_user.id)

@router.get("/", response_model=List[Config])
async def read_configs(
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """Lista todas as configurações do usuário logado."""
    return await crud_config.get_configs_by_user(db=db, user_id=current_user.id)

@router.put("/{config_id}", response_model=Config)
async def update_config(
    config_id: int,
    config: ConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """Atualiza uma configuração existente."""
    db_config = await crud_config.get_config(db=db, config_id=config_id, user_id=current_user.id)
    if db_config is None:
        raise HTTPException(status_code=404, detail="Configuração não encontrada")
    return await crud_config.update_config(db=db, db_config=db_config, config_in=config)

@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_config(
    config_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """Deleta uma configuração."""
    db_config = await crud_config.delete_config(db=db, config_id=config_id, user_id=current_user.id)
    if db_config is None:
        raise HTTPException(status_code=404, detail="Configuração não encontrada")
    return
