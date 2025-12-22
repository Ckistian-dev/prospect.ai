from sqlalchemy import ( Column, Integer, String, ForeignKey, Text, DateTime, func, ARRAY, Time )
from sqlalchemy.orm import relationship, DeclarativeBase, Mapped, mapped_column
from sqlalchemy.dialects.postgresql import JSONB
from typing import List, Optional
from datetime import datetime
from pgvector.sqlalchemy import Vector

# Base declarativa para os modelos do SQLAlchemy.
class Base(DeclarativeBase):
    pass

class User(Base):
    """Modelo de Usuário."""
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    instance_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    
    # --- NOVO CAMPO ADICIONADO ---
    # Armazena o UUID da instância da Evolution API, obtido na conexão.
    instance_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    google_credentials: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    tokens: Mapped[int] = mapped_column(Integer, default=0)
    spreadsheet_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Relacionamentos
    configs: Mapped[List["Config"]] = relationship(back_populates="owner")
    prospects: Mapped[List["Prospect"]] = relationship(back_populates="owner")
    contacts: Mapped[List["Contact"]] = relationship(back_populates="owner")

class Contact(Base):
    """Modelo de Contato."""
    __tablename__ = "contacts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    whatsapp: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    categoria: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String), nullable=True)
    observacoes = Column(Text, nullable=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    # Relacionamentos
    owner: Mapped["User"] = relationship(back_populates="contacts")

class Config(Base):
    """Modelo de Configuração de IA."""
    __tablename__ = "configs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    nome_config: Mapped[str] = mapped_column(String(100), nullable=False)
    
    # --- NOVOS CAMPOS (Baseado no AtendAI) ---
    spreadsheet_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, comment="ID da Planilha de Instruções (System)")
    spreadsheet_rag_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, comment="ID da Planilha de Conhecimento (RAG)")
    drive_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, comment="ID da pasta do Google Drive")
    prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="Contexto fixo gerado a partir das abas de sistema")
    
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    # Relacionamentos
    owner: Mapped["User"] = relationship(back_populates="configs")
    prospects: Mapped[List["Prospect"]] = relationship(back_populates="config")
    vectors: Mapped[List["KnowledgeVector"]] = relationship(back_populates="config", cascade="all, delete-orphan")

class KnowledgeVector(Base):
    """Modelo para armazenar vetores de conhecimento (RAG)."""
    __tablename__ = "contextos"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    config_id: Mapped[int] = mapped_column(ForeignKey("configs.id"), index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False, comment="Conteúdo textual formatado para RAG")
    origin: Mapped[str] = mapped_column(String(50), nullable=False, comment="'sheet' ou 'drive'")
    embedding: Mapped[Optional[List[float]]] = mapped_column(Vector(768), nullable=True, comment="Vetor de embedding (Google text-embedding-004)")

    config: Mapped["Config"] = relationship(back_populates="vectors")

class Prospect(Base):
    __tablename__ = 'prospects'
    id = Column(Integer, primary_key=True, index=True)
    nome_prospeccao = Column(String, index=True, nullable=False)
    status = Column(String, default="Pendente")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    user_id = Column(Integer, ForeignKey('users.id'))
    config_id = Column(Integer, ForeignKey('configs.id'))
    followup_interval_minutes = Column(Integer, default=0)
    initial_message_interval_seconds = Column(Integer, default=90, nullable=False)
    horario_inicio = Column(Time, nullable=True)
    horario_fim = Column(Time, nullable=True)
    
    owner = relationship("User", back_populates="prospects")
    config = relationship("Config")
    contacts = relationship("ProspectContact", back_populates="prospect", cascade="all, delete-orphan")

class ProspectContact(Base):
    __tablename__ = 'prospect_contacts'
    id = Column(Integer, primary_key=True, index=True)
    prospect_id: Mapped[int] = mapped_column(ForeignKey("prospects.id", ondelete="CASCADE"))
    contact_id = Column(Integer, ForeignKey('contacts.id'))
    situacao = Column(Text, default="Aguardando Início")
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="")
    conversa = Column(Text, default="[]")
    media_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    token_usage: Mapped[int] = mapped_column(Integer, default=0, comment="Total de tokens consumidos nesta conversa")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    prospect = relationship("Prospect", back_populates="contacts")
    contact = relationship("Contact")
