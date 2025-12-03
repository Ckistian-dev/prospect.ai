from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.db.models import Base

engine = create_async_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
)

# CORREÇÃO: Renomeado de AsyncSessionLocal para SessionLocal para consistência.
# Esta é a fábrica de sessões que será usada em toda a aplicação.
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

async def get_db():
    """
    Dependência do FastAPI que cria e fecha uma sessão de banco de dados
    para cada requisição.
    """
    async with SessionLocal() as session:
        yield session

async def create_db_and_tables():
    """Cria todas as tabelas no banco de dados se elas não existirem."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

