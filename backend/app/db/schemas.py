from pydantic import BaseModel, EmailStr, computed_field
from typing import List, Optional, Dict, Any
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
    prompt_config: Dict[str, Any]

class ConfigCreate(ConfigBase):
    pass

class ConfigUpdate(BaseModel):
    nome_config: Optional[str] = None
    prompt_config: Optional[Dict[str, Any]] = None

class Config(ConfigBase):
    id: int
    user_id: int

    class Config:
        from_attributes = True


# --- Schema para a Tabela de Ligação ---
class ProspectContact(BaseModel):
    id: int
    prospect_id: int
    contact_id: int
    situacao: str
    observacoes: Optional[str] = None
    conversa: str
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class ProspectContactUpdate(BaseModel):
    situacao: Optional[str] = None
    observacoes: Optional[str] = None


# --- Schemas de Prospecção ---
class ProspectBase(BaseModel):
    nome_prospeccao: str
    config_id: int
    followup_interval_minutes: int = 0
    initial_message_interval_seconds: int = 90

class ProspectCreate(ProspectBase):
    contact_ids: List[int]

class ProspectUpdate(BaseModel):
    nome_prospeccao: Optional[str] = None
    config_id: Optional[int] = None
    status: Optional[str] = None
    followup_interval_minutes: Optional[int] = None
    initial_message_interval_seconds: Optional[int] = None
    contact_ids_to_add: Optional[List[int]] = None

class Prospect(ProspectBase):
    id: int
    user_id: int
    status: str
    log: str
    created_at: datetime
    contacts: List[ProspectContact]

    @computed_field
    @property
    def contact_ids(self) -> List[int]:
        return [pc.contact_id for pc in self.contacts]

    class Config:
        from_attributes = True

class ProspectLog(BaseModel):
    log: str
    status: str


# --- Schemas de Usuário (ATUALIZADO) ---
class UserBase(BaseModel):
    email: EmailStr

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    instance_name: Optional[str] = None
    instance_id: Optional[str] = None
    tokens: Optional[int] = None
    google_credentials: Optional[Dict[str, Any]] = None
    spreadsheet_id: Optional[str] = None

class User(UserBase):
    id: int
    instance_name: Optional[str] = None
    instance_id: Optional[str] = None
    tokens: int
    google_credentials: Optional[Dict[str, Any]] = None

    @computed_field
    @property
    def is_google_connected(self) -> bool:
        return self.google_credentials is not None
    spreadsheet_id: Optional[str] = None

    class Config:
        from_attributes = True

# --- Schemas de Token ---
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None
