from pydantic import BaseModel, EmailStr, computed_field
from typing import List, Optional, Dict, Any
from datetime import datetime, time

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
    spreadsheet_id: Optional[str] = None
    spreadsheet_rag_id: Optional[str] = None
    drive_id: Optional[str] = None
    prompt: Optional[str] = None
    available_hours: Optional[Dict[str, Any]] = None
    is_calendar_active: Optional[bool] = False

class ConfigCreate(ConfigBase):
    pass

class ConfigUpdate(BaseModel):
    nome_config: Optional[str] = None
    spreadsheet_id: Optional[str] = None
    spreadsheet_rag_id: Optional[str] = None
    drive_id: Optional[str] = None
    prompt: Optional[str] = None
    available_hours: Optional[Dict[str, Any]] = None
    google_calendar_credentials: Optional[Dict[str, Any]] = None
    is_calendar_active: Optional[bool] = None

class Config(ConfigBase):
    id: int
    user_id: int
    available_hours: Optional[Dict[str, Any]] = None
    google_calendar_credentials: Optional[Dict[str, Any]] = None
    is_calendar_active: bool = False

    class Config:
        from_attributes = True

# --- Schemas de WhatsappInstance ---
class WhatsappInstanceBase(BaseModel):
    name: str
    instance_name: str
    interval_seconds: Optional[int] = 60
    is_active: Optional[bool] = True

class WhatsappInstanceCreate(WhatsappInstanceBase):
    pass

class WhatsappInstanceUpdate(BaseModel):
    name: Optional[str] = None
    interval_seconds: Optional[int] = None
    is_active: Optional[bool] = None

class WhatsappInstance(WhatsappInstanceBase):
    id: int
    user_id: int
    instance_id: Optional[str] = None
    number: Optional[str] = None
    is_google_connected: bool = False

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
    jid_options: Optional[str] = None
    token_usage: Optional[int] = 0
    lead_score: Optional[int] = 0
    updated_at: Optional[datetime] = None
    whatsapp_instance_id: Optional[int] = None

    class Config:
        from_attributes = True

class ProspectContactUpdate(BaseModel):
    situacao: Optional[str] = None
    observacoes: Optional[str] = None
    jid_options: Optional[str] = None

class ProspectContactRead(BaseModel):
    id: int
    prospect_id: int
    contact_id: int
    status: str  # Mapeado de situacao para compatibilidade com o frontend
    observacoes: Optional[str] = None
    conversa: str
    updated_at: datetime
    nome_contato: str
    whatsapp: str
    nome_prospeccao: str
    token_usage: int
    tags: List[Dict[str, str]] = []  # Mapeado de categoria

class ProspectContactList(BaseModel):
    items: List[ProspectContactRead]
    total: int

# --- Schemas de Prospecção ---
class ProspectBase(BaseModel):
    nome_prospeccao: str
    config_id: int
    followup_interval_minutes: int = 0
    initial_message_interval_seconds: int = 90
    horario_inicio: Optional[time] = None
    horario_fim: Optional[time] = None
    notification_number: Optional[str] = None
    notification_instance_id: Optional[int] = None
    whatsapp_instance_ids: Optional[List[int]] = None
    categorias: Optional[List[str]] = None

class ProspectCreate(ProspectBase):
    contact_ids: List[int]
    whatsapp_instance_ids: List[int]

class ProspectUpdate(BaseModel):
    nome_prospeccao: Optional[str] = None
    config_id: Optional[int] = None
    status: Optional[str] = None
    followup_interval_minutes: Optional[int] = None
    initial_message_interval_seconds: Optional[int] = None
    contact_ids_to_add: Optional[List[int]] = None
    horario_inicio: Optional[time] = None
    horario_fim: Optional[time] = None
    notification_number: Optional[str] = None
    notification_instance_id: Optional[int] = None
    whatsapp_instance_ids: Optional[List[int]] = None
    categorias: Optional[List[str]] = None

class Prospect(ProspectBase):
    id: int
    user_id: int
    status: str
    created_at: datetime
    contacts: List[ProspectContact]

    @computed_field
    @property
    def contact_ids(self) -> List[int]:
        return [pc.contact_id for pc in self.contacts]

    class Config:
        from_attributes = True

# --- Schemas de Log (NOVO) ---
class ProspectActivityLog(BaseModel):
    prospect_contact_id: int # Adicionado para a edição correta
    contact_id: int # Adicionado para permitir a edição a partir do log
    contact_name: str
    contact_whatsapp: str
    situacao: str
    observacoes: Optional[str]
    updated_at: datetime
    conversa: str # Mantemos para o modal de conversa

# --- Schemas de Usuário (ATUALIZADO) ---
class UserBase(BaseModel):
    email: EmailStr

class UserCreate(UserBase):
    password: str

class UserCreateByAdmin(UserBase):
    password: str
    tokens: Optional[int] = 0
    spreadsheet_id: Optional[str] = None
    is_admin: Optional[bool] = False

class UserUpdate(BaseModel):
    tokens: Optional[int] = None
    spreadsheet_id: Optional[str] = None
    is_admin: Optional[bool] = None
    password: Optional[str] = None

class User(UserBase):
    id: int
    tokens: int
    is_admin: bool = False

    spreadsheet_id: Optional[str] = None

    class Config:
        from_attributes = True

class ProspectSimple(BaseModel):
    id: int
    nome_prospeccao: str
    status: str
    class Config:
        from_attributes = True

class UserAdminDetail(User):
    whatsapp_instances: List[WhatsappInstance] = []
    prospects: List[ProspectSimple] = []
    configs: List[Config] = []

# --- Schemas de Token ---
class Token(BaseModel):
    access_token: str
    token_type: str
    is_admin: bool = False

class TokenData(BaseModel):
    email: Optional[str] = None
