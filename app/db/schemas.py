from pydantic import BaseModel, EmailStr, computed_field
from typing import List, Optional
from datetime import datetime

# --- Schemas de Contato ---
class ContactBase(BaseModel):
    nome: str
    whatsapp: str
    categoria: List[str] = []
    observacoes: Optional[str] = None

class ContactCreate(ContactBase):
    pass

class ContactUpdate(BaseModel):
    nome: Optional[str] = None
    whatsapp: Optional[str] = None
    categoria: Optional[List[str]] = None
    observacoes: Optional[str] = None

class Contact(ContactBase):
    id: int
    user_id: int

    class Config:
        from_attributes = True

# --- Schemas de Configuração ---
class ConfigBase(BaseModel):
    nome_config: str
    persona: str
    prompt: str

class ConfigCreate(ConfigBase):
    pass

class ConfigUpdate(BaseModel):
    nome_config: Optional[str] = None
    persona: Optional[str] = None
    prompt: Optional[str] = None

class Config(ConfigBase):
    id: int
    user_id: int

    class Config:
        from_attributes = True


# --- NOVO SCHEMA PARA A TABELA DE LIGAÇÃO ---
# Este schema ensina o Pydantic a ler os dados da tabela prospect_contacts
class ProspectContact(BaseModel):
    id: int
    prospect_id: int
    contact_id: int
    situacao: str
    conversa: str

    class Config:
        from_attributes = True


# --- Schemas de Prospecção (Reestruturados) ---
class ProspectBase(BaseModel):
    nome_prospeccao: str
    config_id: int
    followup_interval_minutes: int = 0

class ProspectCreate(ProspectBase):
    contact_ids: List[int]

class ProspectUpdate(BaseModel):
    nome_prospeccao: Optional[str] = None
    config_id: Optional[int] = None
    status: Optional[str] = None

class Prospect(ProspectBase):
    id: int
    user_id: int
    status: str
    log: str
    created_at: datetime
    # CORREÇÃO: Especifica que a lista 'contacts' conterá itens no formato do schema 'ProspectContact'
    contacts: List[ProspectContact]

    @computed_field
    @property
    def contact_ids(self) -> List[int]:
        # Esta função continua a mesma, mas agora opera sobre uma lista bem definida
        return [pc.contact_id for pc in self.contacts]

    class Config:
        from_attributes = True

class ProspectLog(BaseModel):
    log: str
    status: str


# --- Schemas de Usuário ---
class UserBase(BaseModel):
    email: EmailStr

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    instance_name: Optional[str] = None
    tokens: Optional[int] = None

class User(UserBase):
    id: int
    instance_name: Optional[str] = None
    tokens: int

    class Config:
        from_attributes = True

# --- Schemas de Token ---
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

