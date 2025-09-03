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
    stream = io.StringIO()
    writer = csv.writer(stream)
    
    writer.writerow(["nome", "whatsapp", "categoria"])
    
    contacts = await crud_contact.get_contacts_by_user(db, user_id=current_user.id)
    
    for contact in contacts:
        categories = ",".join(contact.categoria) if contact.categoria else ""
        writer.writerow([contact.nome, contact.whatsapp, categories])
        
    response = StreamingResponse(iter([stream.getvalue()]), media_type="text/csv")
    response.headers["Content-Disposition"] = "attachment; filename=contatos.csv"
    return response


@router.post("/import/csv", summary="Importar contatos de um CSV")
async def import_contacts_csv(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(dependencies.get_current_active_user),
):
    """Recebe um arquivo CSV e cria os contatos para o usuário."""
    if file.content_type not in ["text/csv", "application/vnd.ms-excel"]:
        raise HTTPException(status_code=400, detail="Tipo de arquivo inválido. Por favor, envie um .csv")
        
    try:
        contents = await file.read()
        decoded_content = contents.decode('utf-8')
        stream = io.StringIO(decoded_content)
        reader = csv.DictReader(stream)
        
        imported_count = 0
        for row in reader:
            if not row.get('nome') or not row.get('whatsapp'):
                continue

            categories = [cat.strip() for cat in row.get('categoria', '').split(',') if cat.strip()]

            contact_in = ContactCreate(
                nome=row['nome'],
                whatsapp=row['whatsapp'],
                categoria=categories
            )
            await crud_contact.create_contact(db=db, contact=contact_in, user_id=current_user.id)
            imported_count += 1
            
        return {"message": f"{imported_count} contatos importados com sucesso!"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao processar o arquivo: {e}")

