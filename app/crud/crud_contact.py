from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import models
from app.db.schemas import ContactCreate, ContactUpdate
from typing import List, Set

async def get_contact(db: AsyncSession, contact_id: int, user_id: int) -> models.Contact | None:
    result = await db.execute(
        select(models.Contact).where(models.Contact.id == contact_id, models.Contact.user_id == user_id)
    )
    return result.scalars().first()

async def get_contacts_by_user(db: AsyncSession, user_id: int) -> List[models.Contact]:
    result = await db.execute(
        select(models.Contact).where(models.Contact.user_id == user_id).order_by(models.Contact.nome)
    )
    return result.scalars().all()

async def create_contact(db: AsyncSession, contact: ContactCreate, user_id: int) -> models.Contact:
    db_contact = models.Contact(**contact.model_dump(), user_id=user_id)
    db.add(db_contact)
    await db.commit()
    await db.refresh(db_contact)
    return db_contact

async def update_contact(db: AsyncSession, db_contact: models.Contact, contact_in: ContactUpdate) -> models.Contact:
    update_data = contact_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_contact, key, value)
    db.add(db_contact)
    await db.commit()
    await db.refresh(db_contact)
    return db_contact

async def delete_contact(db: AsyncSession, contact_id: int, user_id: int) -> models.Contact:
    db_contact = await get_contact(db, contact_id=contact_id, user_id=user_id)
    if db_contact:
        await db.delete(db_contact)
        await db.commit()
    return db_contact

# --- NOVA FUNÇÃO ADICIONADA ---
async def get_all_contact_categories(db: AsyncSession, user_id: int) -> List[str]:
    """Busca todas as categorias únicas de contatos para um usuário."""
    contacts = await get_contacts_by_user(db, user_id=user_id)
    all_categories: Set[str] = set()
    for contact in contacts:
        if contact.categoria:
            for category in contact.categoria:
                all_categories.add(category)
    return sorted(list(all_categories))

