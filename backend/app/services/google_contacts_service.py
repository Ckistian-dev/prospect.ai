import logging
from typing import List, Optional, Dict, Any

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from app.core.config import settings
from app.db import models
from app.db.schemas import ContactCreate

logger = logging.getLogger(__name__)

# Escopos necessários para a People API
SCOPES = ['https://www.googleapis.com/auth/contacts']

class GoogleContactsService:
    def __init__(self, user: Optional[models.User] = None):
        self.user = user
        self.flow = self._create_flow()

    def _create_flow(self) -> Flow:
        """Cria uma instância do fluxo de autorização do Google."""
        # O redirect_uri deve corresponder ao que foi configurado no Google Cloud Console
        # e à página do frontend que processa o código de autorização.
        redirect_uri = f"{settings.FRONTEND_URL}/whatsapp"
        
        client_config = {
            "web": {
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [redirect_uri],
            }
        }
        return Flow.from_client_config(client_config, scopes=SCOPES, redirect_uri=redirect_uri)

    def get_authorization_url(self) -> str:
        """Gera a URL de autorização para o usuário."""
        authorization_url, _ = self.flow.authorization_url(
            access_type='offline',
            prompt='consent',
            include_granted_scopes='true'
        )
        return authorization_url

    def fetch_token(self, code: str) -> Dict[str, Any]:
        """Troca o código de autorização por um token de acesso."""
        self.flow.fetch_token(code=code)
        credentials = self.flow.credentials
        # Converte as credenciais para um dicionário serializável em JSON
        return {
            'token': credentials.token,
            'refresh_token': credentials.refresh_token,
            'token_uri': credentials.token_uri,
            'client_id': credentials.client_id,
            'client_secret': credentials.client_secret,
            'scopes': credentials.scopes
        }

    def _get_credentials(self) -> Optional[Credentials]:
        """Recria o objeto de credenciais a partir dos dados salvos no usuário."""
        if not self.user or not self.user.google_credentials:
            return None
        return Credentials.from_authorized_user_info(self.user.google_credentials, SCOPES)

    def _get_service(self):
        """Cria o cliente de serviço da People API."""
        credentials = self._get_credentials()
        if not credentials:
            raise Exception("Usuário não autenticado com o Google.")
        return build('people', 'v1', credentials=credentials, static_discovery=False)

    def _format_contact_for_google(self, contact: ContactCreate) -> Dict[str, Any]:
        """Formata um contato local para o formato da Google People API."""
        return {
            "names": [{"givenName": contact.nome}],
            "phoneNumbers": [{"value": contact.whatsapp, "type": "mobile"}],
            "biographies": [{"value": contact.observacoes or "", "contentType": "TEXT_HTML"}],
        }

    def create_or_update_contact(self, contact: ContactCreate) -> Optional[Dict[str, Any]]:
        """
        Cria ou atualiza um contato no Google Contacts.
        Por simplicidade, esta versão apenas cria. Uma versão mais robusta
        primeiro buscaria pelo número para decidir entre criar e atualizar.
        """
        try:
            service = self._get_service()
            person_body = self._format_contact_for_google(contact)
            
            # Cria o contato
            created_person = service.people().createContact(body=person_body).execute()
            logger.info(f"Contato '{contact.nome}' criado com sucesso no Google Contacts para o usuário {self.user.id}.")
            return created_person
        except HttpError as e:
            logger.error(f"Erro na API do Google ao criar contato para user {self.user.id}: {e}")
            return None
        except Exception as e:
            logger.error(f"Erro inesperado ao sincronizar contato para user {self.user.id}: {e}")
            return None

    def sync_multiple_contacts(self, contacts: List[models.Contact]) -> Dict[str, int]:
        """
        Sincroniza uma lista de contatos com o Google Contacts.
        Esta implementação cria cada contato um por um. Para otimizar,
        a API do Google permite batch requests (people.batchCreateContacts).
        """
        if not self.user or not self.user.google_credentials:
            logger.warning(f"Tentativa de sincronização em massa para o usuário {self.user.id} sem credenciais do Google.")
            return {"success": 0, "failed": len(contacts)}

        success_count = 0
        failed_count = 0

        for contact in contacts:
            # Transforma o modelo SQLAlchemy em um schema Pydantic para a função de formatação
            contact_data = ContactCreate(
                nome=contact.nome,
                whatsapp=contact.whatsapp,
                observacoes=contact.observacoes,
                categoria=contact.categoria or []
            )
            result = self.create_or_update_contact(contact_data)
            if result:
                success_count += 1
            else:
                failed_count += 1
        
        logger.info(f"Sincronização em massa para o usuário {self.user.id} concluída. Sucesso: {success_count}, Falhas: {failed_count}.")
        return {"success": success_count, "failed": failed_count}


def get_google_contacts_service(user: models.User) -> GoogleContactsService:
    """Função de dependência para obter o serviço de contatos do Google."""
    return GoogleContactsService(user=user)