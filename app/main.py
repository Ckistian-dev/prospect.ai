from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.services.whatsapp_service import get_whatsapp_service
import logging

from app.api import auth as auth_router
from app.api import contacts as contacts_router
from app.api import configs as configs_router
from app.api import whatsapp as whatsapp_router
from app.api import prospecting as prospecting_router
from app.api import webhook as webhook_router
from app.api import dashboard as dashboard_router

from app.db.database import engine
from app.db import models

# Configuração básica de logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

# --- Evento de Startup ---
async def create_db_and_tables():
    """
    Evento que é executado quando a aplicação inicia.
    Ele cria todas as tabelas no banco de dados se elas ainda não existirem.
    """
    async with engine.begin() as conn:
        # Em um ambiente de produção, você provavelmente usaria Alembic para migrações.
        # Mas para desenvolvimento, isso é suficiente.
        await conn.run_sync(models.Base.metadata.create_all)
    logging.info("Tabelas do banco de dados verificadas/criadas.")

app = FastAPI(
    title="API de Prospecção de Clientes com PostgreSQL",
    version="2.0.0",
    on_startup=[create_db_and_tables] # Adiciona o evento de startup
)

@app.on_event("shutdown")
async def shutdown_event():
    """Este evento é acionado quando a aplicação FastAPI está sendo desligada."""
    logging.info("O evento de shutdown foi acionado.")
    whatsapp_service = get_whatsapp_service()
    await whatsapp_service.close_db_connection()

# Configuração do CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Em produção, restrinja para o domínio do seu frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inclui os roteadores na aplicação
API_PREFIX = "/api/v1"
app.include_router(auth_router.router, prefix=f"{API_PREFIX}/auth", tags=["Autenticação"])
app.include_router(contacts_router.router, prefix=f"{API_PREFIX}/contacts", tags=["Contatos"])
app.include_router(configs_router.router, prefix=f"{API_PREFIX}/configs", tags=["Configurações de IA"])
app.include_router(whatsapp_router.router, prefix=f"{API_PREFIX}/whatsapp", tags=["WhatsApp"])
app.include_router(prospecting_router.router, prefix=f"{API_PREFIX}/prospecting", tags=["Prospecção"])
app.include_router(webhook_router.router, prefix=f"{API_PREFIX}/webhook", tags=["Webhook"])
app.include_router(dashboard_router.router, prefix=f"{API_PREFIX}/dashboard", tags=["Dashboard"])

@app.get("/", tags=["Root"])
def read_root():
    return {"message": "Bem-vindo à API de Prospecção v2.0"}
