import csv
import io
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Any
from starlette.responses import StreamingResponse

from app.api import dependencies
from app.db.database import get_db
from app.db import models
from app.db.schemas import Contact, ContactCreate, ContactUpdate
from app.crud import crud_contact
from datetime import datetime
from fastapi.responses import Response

router = APIRouter()


@router.get("/", response_model=List[Contact], summary="Listar contatos do usuário")
async def read_contacts(
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user),
):
    """Obtém uma lista de todos os contatos do usuário logado."""
    return await crud_contact.get_contacts_by_user(db, user_id=current_user.id)

# --- NOVA ROTA ADICIONADA ---
@router.get("/categories", response_model=List[str], summary="Listar todas as categorias de contatos")
async def get_contact_categories(
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user),
):
    """Retorna uma lista de todas as categorias de contato únicas para o usuário logado."""
    return await crud_contact.get_all_contact_categories(db, user_id=current_user.id)


@router.post("/", response_model=Contact, status_code=201, summary="Criar um novo contato")
async def create_contact(
    contact: ContactCreate,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user),
):
    """Adiciona um novo contato para o usuário logado."""
    return await crud_contact.create_contact(db=db, contact=contact, user_id=current_user.id)


@router.put("/{contact_id}", response_model=Contact, summary="Atualizar um contato")
async def update_contact(
    contact_id: int,
    contact: ContactUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user),
):
    """Atualiza as informações de um contato existente."""
    db_contact = await crud_contact.get_contact(db, contact_id=contact_id, user_id=current_user.id)
    if not db_contact:
        raise HTTPException(status_code=404, detail="Contato não encontrado")
    return await crud_contact.update_contact(db=db, db_contact=db_contact, contact_in=contact)


@router.delete("/{contact_id}", response_model=Contact, summary="Deletar um contato")
async def delete_contact(
    contact_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user),
):
    """Remove um contato do banco de dados."""
    db_contact = await crud_contact.get_contact(db, contact_id=contact_id, user_id=current_user.id)
    if not db_contact:
        raise HTTPException(status_code=404, detail="Contato não encontrado")
    return await crud_contact.delete_contact(db=db, contact_id=contact_id, user_id=current_user.id)


@router.get("/export/csv", summary="Exportar contatos para CSV")
async def export_contacts_csv(
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user),
):
    """Gera e retorna um arquivo CSV com todos os contatos do usuário."""
    
    # 1. Chama a função do CRUD para gerar a string CSV
    csv_data = await crud_contact.export_contacts_to_csv_string(db, user_id=current_user.id)
    
    # 2. Cria um nome de arquivo dinâmico com a data atual
    today_str = datetime.now().strftime('%Y-%m-%d')
    filename = f"contatos_{today_str}.csv"
    
    # 3. Cria a resposta HTTP
    response = Response(content=csv_data, media_type="text/csv")
    response.headers["Content-Disposition"] = f"attachment; filename={filename}"
    
    return response


@router.post("/import/csv", summary="Importar contatos de um CSV")
async def import_contacts_csv(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user),
):
    """Recebe um arquivo CSV e cria os contatos para o usuário em lote."""
    
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Tipo de arquivo inválido. Por favor, envie um arquivo .csv")
        
    # 1. Chama a função do CRUD para processar o arquivo e salvar no banco
    # O bloco try/except agora está dentro da função do CRUD, deixando a rota mais limpa
    imported_count = await crud_contact.import_contacts_from_csv_file(
        file=file, db=db, user_id=current_user.id
    )
        
    return {"message": f"{imported_count} contatos importados com sucesso!"}

