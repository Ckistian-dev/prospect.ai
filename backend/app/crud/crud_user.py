from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.db import models
from app.db.schemas import UserCreate, UserUpdate, WhatsappInstanceCreate, WhatsappInstanceUpdate
from app.services.security import get_password_hash
import logging

logger = logging.getLogger(__name__)

async def get_users(db: AsyncSession, skip: int = 0, limit: int = 100) -> list[models.User]:
    """Retorna uma lista de usuários."""
    result = await db.execute(select(models.User).offset(skip).limit(limit))
    return result.scalars().all()

async def get_user_by_email(db: AsyncSession, email: str) -> models.User | None:
    """Busca um usuário pelo seu endereço de e-mail."""
    result = await db.execute(select(models.User).filter(models.User.email == email))
    return result.scalars().first()

async def get_user(db: AsyncSession, user_id: int) -> models.User | None:
    """Busca um usuário pelo seu ID."""
    result = await db.execute(select(models.User).filter(models.User.id == user_id))
    return result.scalars().first()

async def create_user(db: AsyncSession, user: UserCreate) -> models.User:
    """Cria um novo usuário no banco de dados com senha hasheada."""
    hashed_password = get_password_hash(user.password)
    db_user = models.User(
        email=user.email,
        hashed_password=hashed_password,
        tokens=user.tokens,
        spreadsheet_id=user.spreadsheet_id
    )
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    return db_user

# --- FUNÇÃO CORRIGIDA ---
async def update_user(db: AsyncSession, db_user: models.User, user_in: UserUpdate) -> models.User:
    """Atualiza os dados de um usuário existente."""
    # O nome do parâmetro 'user' foi alterado para 'db_user' para corresponder à chamada
    update_data = user_in.model_dump(exclude_unset=True)
    if "password" in update_data:
        hashed_password = get_password_hash(update_data["password"])
        db_user.hashed_password = hashed_password
        del update_data["password"]

    for key, value in update_data.items():
        # A variável 'user' foi alterada para 'db_user' aqui também
        setattr(db_user, key, value)

    await db.commit()
    # E aqui
    await db.refresh(db_user)
    # E aqui
    return db_user
# --- FIM DA CORREÇÃO ---

async def decrement_user_tokens(db: AsyncSession, *, db_user: models.User, amount: int = 1):
    """Decrementa os tokens de um usuário pela quantidade especificada."""
    if db_user.tokens is not None and db_user.tokens >= amount:
        db_user.tokens -= amount
        await db.commit()
        await db.refresh(db_user)
        logger.info(f"DEBUG: {amount} token(s) deduzido(s) do usuário {db_user.id}. Restantes: {db_user.tokens}")
    else:
        logger.warning(f"Usuário {db_user.id} não possui tokens suficientes para deduzir {amount} token(s).")

# --- Whatsapp Instances CRUD ---

async def get_whatsapp_instances(db: AsyncSession, user_id: int) -> list[models.WhatsappInstance]:
    result = await db.execute(select(models.WhatsappInstance).where(models.WhatsappInstance.user_id == user_id))
    return result.scalars().all()

async def get_whatsapp_instance(db: AsyncSession, instance_id: int, user_id: int) -> models.WhatsappInstance | None:
    result = await db.execute(select(models.WhatsappInstance).where(models.WhatsappInstance.id == instance_id, models.WhatsappInstance.user_id == user_id))
    return result.scalars().first()

async def get_whatsapp_instance_by_name(db: AsyncSession, instance_name: str) -> models.WhatsappInstance | None:
    result = await db.execute(select(models.WhatsappInstance).where(models.WhatsappInstance.instance_name == instance_name))
    return result.scalars().first()

async def create_whatsapp_instance(db: AsyncSession, instance: WhatsappInstanceCreate, user_id: int) -> models.WhatsappInstance:
    db_instance = models.WhatsappInstance(
        **instance.model_dump(),
        user_id=user_id
    )
    db.add(db_instance)
    await db.commit()
    await db.refresh(db_instance)
    return db_instance

async def update_whatsapp_instance(db: AsyncSession, db_instance: models.WhatsappInstance, instance_in: WhatsappInstanceUpdate) -> models.WhatsappInstance:
    update_data = instance_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_instance, key, value)
    
    await db.commit()
    await db.refresh(db_instance)
    return db_instance

async def delete_whatsapp_instance(db: AsyncSession, db_instance: models.WhatsappInstance):
    await db.delete(db_instance)
    await db.commit()

async def update_whatsapp_instance_credentials(db: AsyncSession, db_instance: models.WhatsappInstance, credentials: dict | None):
    db_instance.google_credentials = credentials
    await db.commit()
    await db.refresh(db_instance)