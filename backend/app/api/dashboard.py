import logging
from fastapi import APIRouter, Depends, Body, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any, Dict

from app.api import dependencies
from app.db.database import get_db
from app.db import models
from app.crud import crud_prospect

from app.services.gemini_service import get_gemini_service
from datetime import datetime

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/", response_model=Dict[str, Any], summary="Obter dados agregados para o dashboard")
async def get_dashboard_data(
    db: AsyncSession = Depends(get_db), 
    current_user: models.User = Depends(dependencies.get_current_active_user),
    start_date: str = None,
    end_date: str = None
):
    """
    Endpoint que coleta, formata e retorna todas as métricas
    necessárias para popular o dashboard do frontend.
    """
    logger.info(f"Endpoint /dashboard acessado pelo usuário {current_user.id}")
    
    start_date_obj = datetime.fromisoformat(start_date) if start_date else None
    end_date_obj = datetime.fromisoformat(end_date) if end_date else None

    dashboard_data = await crud_prospect.get_dashboard_data(
        db, 
        user_id=current_user.id,
        start_date=start_date_obj,
        end_date=end_date_obj
    )
    return dashboard_data

@router.post("/analyze", summary="Analisar dados de prospecção com IA")
async def analyze_data_with_ia(
    payload: Dict[str, Any] = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user),
    gemini_service = Depends(get_gemini_service)
):
    question = payload.get("question")
    start_date_str = payload.get("start_date")
    end_date_str = payload.get("end_date")

    if not question:
        raise HTTPException(status_code=400, detail="A pergunta é obrigatória.")

    start_date = datetime.fromisoformat(start_date_str) if start_date_str else None
    end_date = datetime.fromisoformat(end_date_str) if end_date_str else None

    analysis = await gemini_service.analyze_prospecting_data(
        db=db, user=current_user, question=question, start_date=start_date, end_date=end_date
    )

    return {"analysis": analysis}
