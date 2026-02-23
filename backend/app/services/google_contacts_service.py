import logging
import asyncio
from typing import List, Optional, Dict, Any

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from fastapi import HTTPException

from app.core.config import settings
from app.db import models
from app.db.schemas import ContactCreate

logger = logging.getLogger(__name__)

# Escopos necessários para a People API
SCOPES = ['https://www.googleapis.com/auth/contacts']

class GoogleContactsService:
    def __init__(self, whatsapp_instance: Optional[models.WhatsappInstance] = None):
        self.whatsapp_instance = whatsapp_instance
        # O flow será criado sob demanda para permitir um redirect_uri dinâmico
        self.flow: Optional[Flow] = None

    def _create_flow(self, redirect_uri_override: Optional[str] = None) -> Flow:
        """Cria uma instância do fluxo de autorização do Google."""
        # O redirect_uri deve corresponder ao que foi configurado no Google Cloud Console
        # e à página do frontend que processa o código de autorização.
        # Prioriza o redirect_uri do frontend, se fornecido. Caso contrário, usa o padrão.
        redirect_uri = redirect_uri_override or f"{settings.FRONTEND_URL}/whatsapp"
        
        client_config = {
            "web": {
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                # Esta lista deve conter as URIs autorizadas no Google Cloud Console.
                # Não deve ser modificada dinamicamente aqui.
                # A URI de redirecionamento real é passada para o construtor do Flow.
                "redirect_uris": [f"{settings.FRONTEND_URL}/whatsapp", "http://localhost:5173/whatsapp"],
            }
        }
        return Flow.from_client_config(client_config, scopes=SCOPES, redirect_uri=redirect_uri)

    def get_authorization_url(self, redirect_uri: str) -> str:
        """Gera a URL de autorização para o usuário."""
        # Cria o flow com o redirect_uri fornecido pelo frontend
        self.flow = self._create_flow(redirect_uri_override=redirect_uri)
        authorization_url, _ = self.flow.authorization_url(
            access_type='offline',
            prompt='consent',
            include_granted_scopes='true'
        )
        return authorization_url

    def fetch_token(self, code: str, redirect_uri: str) -> Dict[str, Any]:
        """Troca o código de autorização por um token de acesso."""
        # Recria o flow com o mesmo redirect_uri usado na autorização
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
        """Recria o objeto de credenciais a partir dos dados salvos no usuário."""
        if not self.whatsapp_instance or not self.whatsapp_instance.google_credentials:
            return None
        return Credentials.from_authorized_user_info(self.whatsapp_instance.google_credentials, SCOPES)

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

    async def create_or_update_contact(self, contact: ContactCreate) -> Optional[Dict[str, Any]]:
        """
        Cria um contato no Google Contacts de forma assíncrona.
        A chamada síncrona da biblioteca do Google é executada em uma thread separada.
        """
        try:
            service = self._get_service()
            person_body = self._format_contact_for_google(contact)
            
            # Executa a chamada de bloqueio em uma thread para não bloquear o loop de eventos do asyncio
            loop = asyncio.get_running_loop()
            created_person = await loop.run_in_executor(
                None,  # Usa o executor de thread padrão
                lambda: service.people().createContact(body=person_body).execute()
            )
            
            logger.info(f"Contato '{contact.nome}' criado com sucesso no Google Contacts para a instância {self.whatsapp_instance.id}.")
            return created_person
        except HttpError as e:
            logger.error(f"Erro na API do Google ao criar contato para instância {self.whatsapp_instance.id}: {e}")
            if e.resp.status in [401, 403]:
                raise HTTPException(status_code=403, detail="Permissão negada pela API do Google. A API pode estar desativada ou o token foi revogado. Tente reconectar a conta Google.")
            return None
        except Exception as e:
            logger.error(f"Erro inesperado ao sincronizar contato para instância {self.whatsapp_instance.id}: {e}")
            return None

    async def sync_multiple_contacts(self, contacts: List[models.Contact]) -> Dict[str, int]:
        """
        Sincroniza uma lista de contatos com o Google Contacts usando batch requests (lotes).
        """
        if not self.whatsapp_instance or not self.whatsapp_instance.google_credentials:
            logger.warning(f"Tentativa de sincronização em massa para a instância {self.whatsapp_instance.id if self.whatsapp_instance else 'N/A'} sem credenciais do Google.")
            return {"success": 0, "failed": len(contacts)}

        if not contacts:
            return {"success": 0, "failed": 0}

        try:
            service = self._get_service()
            total_success = 0
            total_failed = 0
            
            # O limite da API People para batchCreateContacts é 200 contatos por requisição
            BATCH_SIZE = 200
            
            # Loop para processar em chunks
            for i in range(0, len(contacts), BATCH_SIZE):
                chunk = contacts[i:i + BATCH_SIZE]
                batch_contacts_data = []
                
                for contact in chunk:
                    contact_data = ContactCreate(
                        nome=contact.nome,
                        whatsapp=contact.whatsapp,
                        observacoes=contact.observacoes,
                        categoria=contact.categoria or []
                    )
                    formatted_contact = self._format_contact_for_google(contact_data)
                    batch_contacts_data.append({"contactPerson": formatted_contact})

                body = {
                    "contacts": batch_contacts_data,
                    "readMask": "names,phoneNumbers"
                }

                loop = asyncio.get_running_loop()
                try:
                    # Executa a chamada de bloqueio em uma thread
                    result = await loop.run_in_executor(
                        None,
                        lambda: service.people().batchCreateContacts(body=body).execute()
                    )
                    
                    created_people = result.get('createdPeople', [])
                    success_count = len(created_people)
                    total_success += success_count
                    total_failed += (len(chunk) - success_count)
                    
                except Exception as e:
                    logger.error(f"Erro no lote {i//BATCH_SIZE + 1} da sincronização para instância {self.whatsapp_instance.id}: {e}")
                    total_failed += len(chunk)

            logger.info(f"Sincronização em massa (Batch) para a instância {self.whatsapp_instance.id} concluída. Sucesso: {total_success}, Falhas: {total_failed}.")
            return {"success": total_success, "failed": total_failed}

        except Exception as e:
            logger.error(f"Erro crítico na sincronização em massa para instância {self.whatsapp_instance.id}: {e}")
            return {"success": 0, "failed": len(contacts)}

    async def batch_create_contacts(self, contacts: List[models.Contact]) -> Dict[str, int]:
        """
        Cria múltiplos contatos no Google Contacts em uma única requisição de lote.
        """
        if not self.whatsapp_instance or not self.whatsapp_instance.google_credentials:
            logger.warning(f"Tentativa de criação em lote para a instância {self.whatsapp_instance.id if self.whatsapp_instance else 'N/A'} sem credenciais do Google.")
            return {"success": 0, "failed": len(contacts)}

        if not contacts:
            return {"success": 0, "failed": 0}

        try:
            service = self._get_service()
            
            # Formata cada contato para a API de lote
            batch_contacts_data = []
            for contact in contacts:
                contact_data = ContactCreate(
                    nome=contact.nome,
                    whatsapp=contact.whatsapp,
                    observacoes=contact.observacoes,
                    categoria=contact.categoria or []
                )
                formatted_contact = self._format_contact_for_google(contact_data)
                batch_contacts_data.append({"contactPerson": formatted_contact})

            body = {
                "contacts": batch_contacts_data,
                # readMask especifica quais campos retornar para os contatos criados
                "readMask": "names,phoneNumbers"
            }

            loop = asyncio.get_running_loop()
            # Executa a chamada de bloqueio em uma thread
            result = await loop.run_in_executor(
                None,
                lambda: service.people().batchCreateContacts(body=body).execute()
            )
            
            success_count = len(result.get('createdPeople', []))
            logger.info(f"Criação em lote para a instância {self.whatsapp_instance.id} concluída. Sucesso: {success_count}, Total: {len(contacts)}.")
            return {"success": success_count, "failed": len(contacts) - success_count}
        except Exception as e:
            logger.error(f"Erro inesperado na criação em lote de contatos para instância {self.whatsapp_instance.id}: {e}")
            return {"success": 0, "failed": len(contacts)}


def get_google_contacts_service(whatsapp_instance: models.WhatsappInstance) -> GoogleContactsService:
    """Função de dependência para obter o serviço de contatos do Google."""
    return GoogleContactsService(whatsapp_instance=whatsapp_instance)