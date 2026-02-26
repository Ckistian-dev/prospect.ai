from sqlalchemy import ( Column, Integer, String, ForeignKey, Text, DateTime, func, ARRAY, Time, Boolean )
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

    tokens: Mapped[int] = mapped_column(Integer, default=0)
    spreadsheet_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)

    # Relacionamentos
    configs: Mapped[List["Config"]] = relationship(back_populates="owner")
    prospects: Mapped[List["Prospect"]] = relationship(back_populates="owner")
    contacts: Mapped[List["Contact"]] = relationship(back_populates="owner")
    whatsapp_instances: Mapped[List["WhatsappInstance"]] = relationship(back_populates="owner", cascade="all, delete-orphan")

class WhatsappInstance(Base):
    """Modelo de Instância do WhatsApp."""
    __tablename__ = "whatsapp_instances"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(100))
    instance_name: Mapped[str] = mapped_column(String(100), unique=True)
    instance_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    google_credentials: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    interval_seconds: Mapped[int] = mapped_column(Integer, default=60)
    last_message_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    owner: Mapped["User"] = relationship(back_populates="whatsapp_instances")
    prospect_contacts: Mapped[List["ProspectContact"]] = relationship(back_populates="whatsapp_instance")

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
    
    google_calendar_credentials: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    available_hours: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True, comment="Horários disponíveis para agendamento")
    is_calendar_active: Mapped[bool] = mapped_column(Boolean, default=False)
    
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
    notification_number = Column(String, nullable=True)
    notification_instance_id = Column(Integer, ForeignKey("whatsapp_instances.id"), nullable=True)
    whatsapp_instance_ids: Mapped[Optional[List[int]]] = mapped_column(JSONB, nullable=True)
    categorias: Mapped[Optional[List[str]]] = mapped_column(JSONB, nullable=True)
    
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
    jid_options = Column(Text, nullable=True, comment="Opções de JID (CSV) retornadas pelo IsOnWhatsapp")
    token_usage: Mapped[int] = mapped_column(Integer, default=0, comment="Total de tokens consumidos nesta conversa")
    lead_score: Mapped[int] = mapped_column(Integer, default=0, comment="Pontuação do lead (0-10)")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_notification_message_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    whatsapp_instance_id: Mapped[Optional[int]] = mapped_column(ForeignKey("whatsapp_instances.id"), nullable=True)
    
    prospect = relationship("Prospect", back_populates="contacts")
    contact = relationship("Contact")
    whatsapp_instance = relationship("WhatsappInstance", back_populates="prospect_contacts")
