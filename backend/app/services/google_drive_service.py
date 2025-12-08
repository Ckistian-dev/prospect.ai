import logging
import json
from google.oauth2 import service_account
from googleapiclient.discovery import build
from app.core.config import settings

logger = logging.getLogger(__name__)

class GoogleDriveService:
    def __init__(self):
        self.service = None
        self.scopes = ['https://www.googleapis.com/auth/drive.readonly']
        
        try:
            json_str = settings.GOOGLE_SERVICE_ACCOUNT_JSON
            if not json_str:
                raise ValueError("A variável de ambiente GOOGLE_SERVICE_ACCOUNT_JSON não está definida.")

            creds_info = json.loads(json_str)
            
            logger.info("Drive: Autenticando via credenciais de serviço...")
            self.creds = service_account.Credentials.from_service_account_info(
                creds_info, scopes=self.scopes
            )

            self.service = build('drive', 'v3', credentials=self.creds)
            logger.info("Drive: Serviço inicializado com sucesso.")

        except json.JSONDecodeError as e:
            logger.error("Drive: Erro ao decodificar o JSON da variável GOOGLE_SERVICE_ACCOUNT_JSON.", exc_info=True)
            self.service = None
        except Exception as e:
            logger.error(f"Drive: Erro crítico ao iniciar serviço: {e}", exc_info=True)
            self.service = None

    def _get_readable_type(self, mime_type: str) -> str:
        if 'image' in mime_type: return 'image'
        if 'video' in mime_type: return 'video'
        if 'pdf' in mime_type: return 'document'
        if 'word' in mime_type or 'document' in mime_type: return 'document'
        if 'sheet' in mime_type or 'excel' in mime_type: return 'document'
        if 'presentation' in mime_type or 'powerpoint' in mime_type: return 'document'
        if 'folder' in mime_type: return 'folder'
        return 'document'

    async def list_files_in_folder(self, root_folder_id: str):
        if not self.service:
            logger.error("Drive: Tentativa de uso sem serviço inicializado.")
            return {"tree": {}, "count": 0}

        try:
            root_meta = self.service.files().get(fileId=root_folder_id, fields='name').execute()
            root_name = root_meta.get('name', 'Raiz')
        except Exception:
            root_name = 'Pasta Principal'

        root_structure = {
            "nome": root_name,
            "arquivos": [],
            "subpastas": []
        }

        folder_map = {root_folder_id: root_structure}
        folders_to_scan = [root_folder_id]
        scanned_folders = set()
        
        MAX_FILES_LIMIT = 500
        total_files_count = 0

        try:
            while folders_to_scan and total_files_count < MAX_FILES_LIMIT:
                current_folder_id = folders_to_scan.pop(0)
                current_folder_node = folder_map.get(current_folder_id)

                if current_folder_id in scanned_folders:
                    continue
                
                scanned_folders.add(current_folder_id)
                
                page_token = None
                while True:
                    if total_files_count >= MAX_FILES_LIMIT: break

                    query = f"'{current_folder_id}' in parents and trashed = false"
                    
                    results = self.service.files().list(
                        q=query,
                        pageSize=100,
                        fields="nextPageToken, files(id, name, mimeType)",
                        pageToken=page_token
                    ).execute()
                    
                    items = results.get('files', [])
                    
                    for item in items:
                        if item['mimeType'] == 'application/vnd.google-apps.folder':
                            new_folder_node = { "nome": item['name'], "arquivos": [], "subpastas": [] }
                            current_folder_node['subpastas'].append(new_folder_node)
                            folder_map[item['id']] = new_folder_node
                            folders_to_scan.append(item['id'])
                        else:
                            current_folder_node['arquivos'].append({
                                "nome": item['name'],
                                "id": item['id'],
                                "tipo": self._get_readable_type(item['mimeType']),
                            })
                            total_files_count += 1
                    
                    page_token = results.get('nextPageToken')
                    if not page_token:
                        break
            
            logger.info(f"Drive: Varredura completa. {total_files_count} arquivos organizados em árvore.")
            return {"tree": root_structure, "count": total_files_count}

        except Exception as e:
            logger.error(f"Drive: Erro ao listar arquivos recursivamente: {e}")
            if "403" in str(e):
                raise Exception("Erro de Permissão (403). Você compartilhou a pasta com o email da Service Account?")
            if "404" in str(e):
                raise Exception("Pasta não encontrada (404). Verifique o ID.")
            raise e

_drive_service = None
def get_drive_service():
    global _drive_service
    if _drive_service is None:
        _drive_service = GoogleDriveService()
    return _drive_service