import logging
import csv
import io
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import UploadFile, HTTPException
from app.db import models
from app.db.schemas import ContactCreate, ContactUpdate
from app.crud import crud_user
from app.services.google_contacts_service import GoogleContactsService
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

    # Sincronização com Google Contacts
    user = await crud_user.get_user(db, user_id=user_id)
    if user and user.google_credentials:
        logger.info(f"Iniciando sincronização com Google Contacts para o novo contato: {db_contact.id}")
        google_service = GoogleContactsService(user=user)
        google_service.create_or_update_contact(contact)

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
        
        # Sincronização em massa com Google Contacts
        user = await crud_user.get_user(db, user_id=user_id)
        if user and user.google_credentials:
            logger.info(f"Iniciando sincronização em massa de {len(contacts_to_create)} contatos com o Google.")
            # `contacts_to_create` contém objetos `models.Contact` que acabaram de ser criados
            google_service = GoogleContactsService(user=user)
            google_service.sync_multiple_contacts(contacts_to_create)

        return len(contacts_to_create)

    except Exception as e:
        logger.error(f"Erro detalhado ao processar CSV: {e}")
        raise HTTPException(status_code=500, detail=f"Ocorreu um erro ao processar o arquivo CSV. Verifique o formato e o conteúdo. Detalhe: {e}")
