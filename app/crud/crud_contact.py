import logging
import csv
import io
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import UploadFile, HTTPException
from app.db import models
from app.db.schemas import ContactCreate, ContactUpdate
from typing import List, Set, Optional, Dict, Any

logger = logging.getLogger(__name__)

def _clean_whatsapp_number(number: str) -> str:
    """Helper para remover todos os caracteres não numéricos de um número de telefone."""
    if not isinstance(number, str):
        return ""
    return "".join(filter(str.isdigit, number))

async def get_contact(db: AsyncSession, contact_id: int, user_id: int) -> Optional[models.Contact]:
    """Busca um único contato pelo seu ID e pelo ID do usuário."""
    result = await db.execute(
        select(models.Contact).where(models.Contact.id == contact_id, models.Contact.user_id == user_id)
    )
    return result.scalars().first()

async def get_contacts_by_user(db: AsyncSession, user_id: int) -> List[models.Contact]:
    """Busca todos os contatos de um usuário, ordenados por nome."""
    result = await db.execute(
        select(models.Contact).where(models.Contact.user_id == user_id).order_by(models.Contact.nome)
    )
    return result.scalars().all()

async def get_contact_by_whatsapp(db: AsyncSession, whatsapp: str, user_id: int) -> Optional[models.Contact]:
    """Busca um contato específico pelo número de WhatsApp para um usuário."""
    result = await db.execute(
        select(models.Contact).where(models.Contact.whatsapp == whatsapp, models.Contact.user_id == user_id)
    )
    return result.scalars().first()

async def create_contact(db: AsyncSession, contact: ContactCreate, user_id: int) -> models.Contact:
    """Cria um novo contato, garantindo que o número de WhatsApp seja limpo."""
    cleaned_whatsapp = _clean_whatsapp_number(contact.whatsapp)
    db_contact = models.Contact(
        nome=contact.nome,
        whatsapp=cleaned_whatsapp,
        categoria=contact.categoria,
        observacoes=contact.observacoes,
        user_id=user_id
    )
    db.add(db_contact)
    await db.commit()
    await db.refresh(db_contact)
    return db_contact

async def update_contact(db: AsyncSession, db_contact: models.Contact, contact_in: ContactUpdate) -> models.Contact:
    """Atualiza um contato existente, garantindo que o número de WhatsApp seja limpo se for alterado."""
    update_data = contact_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if key == "whatsapp":
            value = _clean_whatsapp_number(value)
        setattr(db_contact, key, value)
    db.add(db_contact)
    await db.commit()
    await db.refresh(db_contact)
    return db_contact

async def delete_contact(db: AsyncSession, contact_id: int, user_id: int) -> Optional[models.Contact]:
    """Deleta um contato do banco de dados."""
    db_contact = await get_contact(db, contact_id=contact_id, user_id=user_id)
    if db_contact:
        await db.delete(db_contact)
        await db.commit()
    return db_contact

# --- FUNÇÃO ADICIONADA ---
async def create_or_update_contacts(db: AsyncSession, contacts_in: List[Dict[str, Any]], user_id: int) -> Dict[str, Any]:
    """Cria novos contatos ou atualiza existentes com base nos dados de uma planilha."""
    created_count = 0
    updated_count = 0
    
    for contact_data in contacts_in:
        whatsapp_number = contact_data.get('whatsapp')
        if not whatsapp_number:
            continue

        clean_whatsapp = _clean_whatsapp_number(str(whatsapp_number))
        
        existing_contact = await get_contact_by_whatsapp(db, whatsapp=clean_whatsapp, user_id=user_id)
        
        if existing_contact:
            existing_contact.nome = contact_data.get('nome', existing_contact.nome)
            existing_contact.categoria = contact_data.get('categoria', existing_contact.categoria)
            existing_contact.observacoes = contact_data.get('observacoes', existing_contact.observacoes)
            updated_count += 1
        else:
            new_contact = models.Contact(
                nome=contact_data.get('nome'),
                whatsapp=clean_whatsapp,
                categoria=contact_data.get('categoria', []),
                observacoes=contact_data.get('observacoes'),
                user_id=user_id
            )
            db.add(new_contact)
            created_count += 1
            
    await db.commit()
    
    return {
        "message": f"Sincronização concluída: {created_count} contatos criados e {updated_count} atualizados.",
        "created": created_count,
        "updated": updated_count
    }

async def get_all_contact_categories(db: AsyncSession, user_id: int) -> List[str]:
    """Busca todas as categorias únicas de contatos para um usuário."""
    contacts = await get_contacts_by_user(db, user_id=user_id)
    all_categories: Set[str] = set()
    for contact in contacts:
        if contact.categoria:
            for category in contact.categoria:
                all_categories.add(category)
    return sorted(list(all_categories))

async def get_total_contacts_count(db: AsyncSession, user_id: int) -> int:
    """Calcula o número total de contatos de um usuário para o dashboard."""
    logger.info(f"DASHBOARD: Calculando total de contatos para o usuário {user_id}")
    count_query = select(func.count(models.Contact.id)).where(models.Contact.user_id == user_id)
    total_contacts = await db.execute(count_query)
    return total_contacts.scalar_one_or_none() or 0

async def export_contacts_to_csv_string(db: AsyncSession, user_id: int) -> str:
    """
    Busca todos os contatos de um usuário no banco e gera uma string em formato CSV.
    """
    contacts = await get_contacts_by_user(db, user_id=user_id)
    
    stream = io.StringIO()
    writer = csv.writer(stream)
    
    writer.writerow(["nome", "whatsapp", "categoria", "observacoes"])
    
    for contact in contacts:
        categories_str = ",".join(contact.categoria) if contact.categoria else ""
        writer.writerow([
            contact.nome, 
            contact.whatsapp, 
            categories_str, 
            contact.observacoes or ""
        ])
        
    return stream.getvalue()

async def import_contacts_from_csv_file(file: UploadFile, db: AsyncSession, user_id: int) -> int:
    """
    Processa um UploadFile CSV, valida as linhas e cria os contatos em lote.
    """
    try:
        contents = await file.read()
        try:
            decoded_content = contents.decode('utf-8')
        except UnicodeDecodeError:
            decoded_content = contents.decode('latin-1')
            
        stream = io.StringIO(decoded_content)
        reader = csv.DictReader(stream)
        
        contacts_to_create = []
        for row in reader:
            if not row.get('nome') or not row.get('whatsapp'):
                continue

            clean_whatsapp = "".join(filter(str.isdigit, row['whatsapp']))
            categories = [cat.strip() for cat in row.get('categoria', '').split(',') if cat.strip()]
            observacoes = row.get('observacoes', None)

            contact_obj = models.Contact(
                nome=row['nome'],
                whatsapp=clean_whatsapp,
                categoria=categories,
                observacoes=observacoes,
                user_id=user_id
            )
            contacts_to_create.append(contact_obj)

        if not contacts_to_create:
            return 0

        db.add_all(contacts_to_create)
        await db.commit()
        
        return len(contacts_to_create)

    except Exception as e:
        logger.error(f"Erro detalhado ao processar CSV: {e}")
        raise HTTPException(status_code=500, detail=f"Ocorreu um erro ao processar o arquivo CSV. Verifique o formato e o conteúdo. Detalhe: {e}")

