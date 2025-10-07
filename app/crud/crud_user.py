from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.db import models
from app.db.schemas import UserCreate, UserUpdate
from app.services.security import get_password_hash
import logging

logger = logging.getLogger(__name__)

async def get_user_by_email(db: AsyncSession, email: str) -> models.User | None:
    """Busca um usuário pelo seu endereço de e-mail."""
    result = await db.execute(select(models.User).filter(models.User.email == email))
    return result.scalars().first()

async def get_user_by_instance_name(db: AsyncSession, instance_name: str) -> models.User | None:
    """Busca um usuário pelo nome da instância do WhatsApp."""
    result = await db.execute(select(models.User).filter(models.User.instance_name == instance_name))
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
        instance_name=user.instance_name,
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

async def get_user_by_instance(db: AsyncSession, instance_name: str) -> models.User | None:
    """Busca um usuário pelo nome da sua instância do WhatsApp."""
    result = await db.execute(select(models.User).where(models.User.instance_name == instance_name))
    return result.scalars().first()