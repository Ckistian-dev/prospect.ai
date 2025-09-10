import logging
import csv
import io
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import UploadFile
from app.db import models
from app.db.schemas import ContactCreate, ContactUpdate
from typing import List, Set

logger = logging.getLogger(__name__)

def _clean_whatsapp_number(number: str) -> str:
    """Helper para remover todos os caracteres não numéricos de um número de telefone."""
    if not isinstance(number, str):
        return ""
    return "".join(filter(str.isdigit, number))

async def get_contact(db: AsyncSession, contact_id: int, user_id: int) -> models.Contact | None:
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

async def delete_contact(db: AsyncSession, contact_id: int, user_id: int) -> models.Contact:
    """Deleta um contato do banco de dados."""
    db_contact = await get_contact(db, contact_id=contact_id, user_id=user_id)
    if db_contact:
        await db.delete(db_contact)
        await db.commit()
    return db_contact

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

async def export_contacts_to_csv(db: AsyncSession, user_id: int) -> str:
    """Gera uma string CSV com os contatos do usuário, incluindo observações."""
    contacts = await get_contacts_by_user(db, user_id=user_id)
    stream = io.StringIO()
    writer = csv.writer(stream)
    writer.writerow(["nome", "whatsapp", "categoria", "observacoes"])
    for contact in contacts:
        categories = ",".join(contact.categoria) if contact.categoria else ""
        writer.writerow([contact.nome, contact.whatsapp, categories, contact.observacoes or ""])
    return stream.getvalue()

async def import_contacts_from_csv(file: UploadFile, db: AsyncSession, user_id: int) -> int:
    """Importa contatos de um arquivo CSV, incluindo observações."""
    contents = await file.read()
    decoded_content = contents.decode('utf-8')
    stream = io.StringIO(decoded_content)
    reader = csv.DictReader(stream)
    
    imported_count = 0
    for row in reader:
        if not row.get('nome') or not row.get('whatsapp'):
            continue
        categories = [cat.strip() for cat in row.get('categoria', '').split(',') if cat.strip()]
        observacoes = row.get('observacoes', None)
        contact_in = ContactCreate(nome=row['nome'], whatsapp=row['whatsapp'], categoria=categories, observacoes=observacoes)
        await create_contact(db=db, contact=contact_in, user_id=user_id)
        imported_count += 1
    return imported_count

