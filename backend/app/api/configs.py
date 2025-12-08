from fastapi import APIRouter, Depends, HTTPException, status, Body
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any
import logging

from app.db.database import get_db
from app.db import models
from app.db.schemas import Config, ConfigCreate, ConfigUpdate
from app.crud import crud_config
from app.api.dependencies import get_current_active_user
from app.services.google_sheets_service import GoogleSheetsService
from app.services.google_drive_service import get_drive_service

logger = logging.getLogger(__name__)
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

@router.post("/sync_sheet", summary="Sincronizar planilha do Google Sheets com uma Configuração")
async def sync_google_sheet(
    payload: Dict[str, Any] = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    config_id = payload.get("config_id")
    spreadsheet_id = payload.get("spreadsheet_id")

    if not config_id:
        raise HTTPException(status_code=400, detail="config_id é obrigatório.")

    db_config = await crud_config.get_config(db=db, config_id=config_id, user_id=current_user.id)
    if not db_config:
        raise HTTPException(status_code=404, detail="Configuração não encontrada.")
    
    final_spreadsheet_id = spreadsheet_id or db_config.spreadsheet_id
    if not final_spreadsheet_id:
        raise HTTPException(status_code=400, detail="Nenhum link de planilha associado. Salve o link primeiro.")

    try:
        sheets_service = GoogleSheetsService()
        sheet_data_json = await sheets_service.get_sheet_as_json(final_spreadsheet_id)
        
        config_update = ConfigUpdate(contexto_sheets=sheet_data_json, spreadsheet_id=final_spreadsheet_id)
        updated_config = await crud_config.update_config(db=db, db_config=db_config, config_in=config_update)
        
        await db.commit()
        await db.refresh(updated_config)

        return {
            "message": "Planilha sincronizada com sucesso!", 
            "sheets_found": list(sheet_data_json.keys()),
            "contexto_sheets": updated_config.contexto_sheets
        }
    
    except Exception as e:
        logger.error(f"Falha na rota sync_sheet: {e}", exc_info=True)
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Falha ao sincronizar planilha: {str(e)}")

@router.post("/sync_drive", summary="Sincronizar pasta do Google Drive")
async def sync_google_drive(
    payload: Dict[str, Any] = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    config_id = payload.get("config_id")
    drive_id = payload.get("drive_id")

    if not config_id:
        raise HTTPException(status_code=400, detail="config_id é obrigatório.")

    db_config = await crud_config.get_config(db=db, config_id=config_id, user_id=current_user.id)
    if not db_config:
        raise HTTPException(status_code=404, detail="Configuração não encontrada.")
    
    final_drive_id = drive_id or db_config.drive_id
    if not final_drive_id:
        raise HTTPException(status_code=400, detail="Nenhum ID de pasta associado. Insira o ID da pasta do Google Drive.")

    try:
        drive_service = get_drive_service()
        drive_data = await drive_service.list_files_in_folder(final_drive_id)
        
        config_update = ConfigUpdate(arquivos_drive=drive_data.get("tree", {}), drive_id=final_drive_id)
        updated_config = await crud_config.update_config(db=db, db_config=db_config, config_in=config_update)
        
        await db.commit()
        await db.refresh(updated_config)

        return {
            "message": "Pasta do Drive sincronizada com sucesso!", 
            "files_count": drive_data.get("count", 0),
            "arquivos_drive": updated_config.arquivos_drive
        }
    
    except Exception as e:
        logger.error(f"Falha na rota sync_drive: {e}", exc_info=True)
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Falha ao sincronizar Drive: {str(e)}")
