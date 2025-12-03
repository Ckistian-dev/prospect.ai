import os
import logging
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth as auth_router
from app.api import contacts as contacts_router
from app.api import configs as configs_router
from app.api import whatsapp as whatsapp_router
from app.api import prospecting as prospecting_router
from app.api import webhook as webhook_router
from app.api import dashboard as dashboard_router
from app.api import google as google_contacts_router

from app.db.database import engine
from app.db import models

# Carrega as variáveis de ambiente do arquivo .env
# Isso deve ser feito antes de acessar as variáveis
load_dotenv()

# Configuração básica de logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

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
    logger.info("Tabelas do banco de dados verificadas/criadas.")    


app = FastAPI(
    title="API de Prospecção de Clientes com PostgreSQL",
    version="2.0.0",
    on_startup=[create_db_and_tables] # Adiciona o evento de startup
)

@app.on_event("shutdown")
async def shutdown_event():
    """Este evento é acionado quando a aplicação FastAPI está sendo desligada."""
    logger.info("Evento de shutdown acionado. Encerrando a aplicação.")

# --- Configuração do CORS ---

# Lê a URL do frontend a partir da variável de ambiente .env
FRONTEND_URL = os.getenv("FRONTEND_URL")

# Lista de origens permitidas
origins = []

if FRONTEND_URL:
    logger.info(f"Permitindo origem do frontend: {FRONTEND_URL}")
    origins.append(FRONTEND_URL)
else:
    logger.warning("Variável de ambiente FRONTEND_URL não definida.")
    # Adicione aqui origens de desenvolvimento local se desejar, como fallback
    origins.extend([
        "http://localhost:3000",
        "http://localhost:5173", # Se usar Vite/React no local
    ])


app.add_middleware(
    CORSMiddleware,
    allow_origins=origins, # <-- AQUI ESTÁ A MUDANÇA
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
app.include_router(google_contacts_router.router, prefix=f"{API_PREFIX}/google-contacts", tags=["Google Contacts"])

@app.get("/", tags=["Root"])
def read_root():
    return {"message": "Bem-vindo à API de Prospecção v2.0"}
