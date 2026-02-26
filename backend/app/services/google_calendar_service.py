import logging
import os
from typing import Optional, Dict, Any
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from app.core.config import settings
from app.db import models

logger = logging.getLogger(__name__)

# Escopos necessários para o Google Calendar
SCOPES = ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/calendar.events']

class GoogleCalendarService:
    def __init__(self, config: Optional[models.Config] = None):
        self.config = config
        self.flow: Optional[Flow] = None

    def _create_flow(self, redirect_uri_override: Optional[str] = None) -> Flow:
        """Cria uma instância do fluxo de autorização do Google."""
        # O redirect_uri deve corresponder ao que foi configurado no Google Cloud Console
        # e à página do frontend que processa o código de autorização.
        redirect_uri = redirect_uri_override or f"{settings.FRONTEND_URL}/configs"
        
        redirect_uris = [f"{settings.FRONTEND_URL}/configs", "http://localhost:5173/configs"]
        if redirect_uri and redirect_uri not in redirect_uris:
            redirect_uris.append(redirect_uri)

        client_config = {
            "web": {
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": redirect_uris,
            }
        }
        return Flow.from_client_config(client_config, scopes=SCOPES, redirect_uri=redirect_uri)

    def get_authorization_url(self, redirect_uri: str) -> str:
        """Gera a URL de autorização para o usuário."""
        self.flow = self._create_flow(redirect_uri_override=redirect_uri)
        authorization_url, _ = self.flow.authorization_url(
            access_type='offline',
            prompt='consent',
            include_granted_scopes='true'
        )
        return authorization_url

    def fetch_token(self, code: str, redirect_uri: str) -> Dict[str, Any]:
        """Troca o código de autorização por um token de acesso."""
        # Relaxa a verificação de escopo para evitar erros quando o Google retorna escopos adicionais (ex: contacts)
        os.environ['OAUTHLIB_RELAX_TOKEN_SCOPE'] = '1'
        
        self.flow = self._create_flow(redirect_uri_override=redirect_uri)
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
        """Recria o objeto de credenciais a partir dos dados salvos na configuração."""
        if not self.config or not self.config.google_calendar_credentials:
            return None
        return Credentials.from_authorized_user_info(self.config.google_calendar_credentials, SCOPES)

    def get_service(self):
        """Cria o cliente de serviço da Calendar API."""
        credentials = self._get_credentials()
        if not credentials:
            raise Exception("Configuração não autenticada com o Google Calendar.")
        return build('calendar', 'v3', credentials=credentials)

def get_google_calendar_service(config: models.Config) -> GoogleCalendarService:
    return GoogleCalendarService(config=config)
