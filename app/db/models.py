from sqlalchemy import ( Column, Integer, String, ForeignKey, Text, DateTime, func, ARRAY )
from sqlalchemy.orm import relationship, DeclarativeBase, Mapped, mapped_column
from sqlalchemy.dialects.postgresql import JSONB
from typing import List
from datetime import datetime

# Base declarativa para os modelos do SQLAlchemy.
class Base(DeclarativeBase):
    pass

class User(Base):
    """Modelo de Usuário."""
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    instance_name: Mapped[str] = mapped_column(String(100), nullable=True)
    tokens: Mapped[int] = mapped_column(Integer, default=0)
    spreadsheet_id: Mapped[str] = mapped_column(String(255), nullable=True)

    # Relacionamentos
    configs: Mapped[List["Config"]] = relationship(back_populates="owner")
    prospects: Mapped[List["Prospect"]] = relationship(back_populates="owner")
    contacts: Mapped[List["Contact"]] = relationship(back_populates="owner")

class Contact(Base):
    """Modelo de Contato."""
    __tablename__ = "contacts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    whatsapp: Mapped[str] = mapped_column(String(50), nullable=True)
    categoria: Mapped[List[str]] = mapped_column(ARRAY(String), nullable=True)
    observacoes = Column(Text, nullable=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    # Relacionamentos
    owner: Mapped["User"] = relationship(back_populates="contacts")

class Config(Base):
    """
    Modelo de Configuração de IA.
    Armazena toda a estrutura do prompt em um único campo JSON.
    """
    __tablename__ = "configs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    nome_config: Mapped[str] = mapped_column(String(100), nullable=False)
    
    # CAMPO UNIFICADO: Substitui os antigos 'persona' e 'prompt'.
    # Armazena um objeto JSON com toda a configuração da IA.
    prompt_config: Mapped[dict] = mapped_column(JSONB, nullable=False)
    
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    # Relacionamentos
    owner: Mapped["User"] = relationship(back_populates="configs")
    prospects: Mapped[List["Prospect"]] = relationship(back_populates="config")

class Prospect(Base):
    __tablename__ = 'prospects'
    id = Column(Integer, primary_key=True, index=True)
    nome_prospeccao = Column(String, index=True, nullable=False)
    status = Column(String, default="Pendente")
    log = Column(Text, default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    user_id = Column(Integer, ForeignKey('users.id'))
    config_id = Column(Integer, ForeignKey('configs.id'))
    followup_interval_minutes = Column(Integer, default=0) # Armazena o tempo em minutos. 0 = desativado.
    
    # CORREÇÃO: Padronizado para 'owner' para corresponder ao back_populates no User.
    owner = relationship("User", back_populates="prospects")
    config = relationship("Config")
    
    contacts = relationship("ProspectContact", back_populates="prospect", cascade="all, delete-orphan")

class ProspectContact(Base):
    __tablename__ = 'prospect_contacts'
    id = Column(Integer, primary_key=True, index=True)
    prospect_id = Column(Integer, ForeignKey('prospects.id'))
    contact_id = Column(Integer, ForeignKey('contacts.id'))
    situacao = Column(String, default="Aguardando Início")
    observacoes: Mapped[str] = mapped_column(Text, nullable=True, default="")
    conversa = Column(Text, default="[]")
    media_type: Mapped[str] = mapped_column(String(50), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    prospect = relationship("Prospect", back_populates="contacts")
    contact = relationship("Contact")