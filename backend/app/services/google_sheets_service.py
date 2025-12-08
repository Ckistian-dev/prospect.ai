import logging
import json
import pandas as pd
import numpy as np
from typing import Dict, List, Any
from google.oauth2 import service_account
from googleapiclient.discovery import build
from app.core.config import settings

logger = logging.getLogger(__name__)

class GoogleSheetsService:
    def __init__(self):
        self.scopes = ['https://www.googleapis.com/auth/spreadsheets.readonly']
        self.service = None
        
        try:
            # GOOGLE_SERVICE_ACCOUNT_JSON deve ser uma string JSON no seu .env
            json_str = settings.GOOGLE_SERVICE_ACCOUNT_JSON
            if not json_str:
                raise ValueError("A variável de ambiente GOOGLE_SERVICE_ACCOUNT_JSON não está definida.")
            
            creds_info = json.loads(json_str)
            
            logger.info("Sheets: Autenticando via credenciais de serviço...")
            self.creds = service_account.Credentials.from_service_account_info(
                creds_info, scopes=self.scopes
            )
            
            self.service = build('sheets', 'v4', credentials=self.creds)
            logger.info("Sheets: Serviço inicializado com sucesso.")

        except json.JSONDecodeError:
            logger.error("Sheets: Erro ao decodificar JSON da variável GOOGLE_SERVICE_ACCOUNT_JSON.")
            self.service = None
        except Exception as e:
            logger.error(f"Sheets: Erro crítico na inicialização: {e}", exc_info=True)
            self.service = None

    async def get_sheet_as_json(self, spreadsheet_id_or_url: str) -> Dict[str, List[Dict[str, Any]]]:
        if not self.service:
            raise Exception("Serviço Google Sheets não está autenticado/inicializado.")

        spreadsheet_id = spreadsheet_id_or_url
        if "docs.google.com" in spreadsheet_id_or_url:
            try:
                start = spreadsheet_id_or_url.find("/d/") + 3
                end = spreadsheet_id_or_url.find("/", start)
                spreadsheet_id = spreadsheet_id_or_url[start:end if end != -1 else None]
            except Exception:
                pass 

        final_json_context = {}

        try:
            sheet_metadata = self.service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
            sheets = sheet_metadata.get('sheets', [])

            if not sheets:
                raise Exception("Nenhuma aba encontrada na planilha.")

            for sheet in sheets:
                title = sheet['properties']['title']
                
                result = self.service.spreadsheets().values().get(
                    spreadsheetId=spreadsheet_id, 
                    range=title
                ).execute()
                
                rows = result.get('values', [])

                if len(rows) < 2:
                    continue

                headers = rows[0]
                data = rows[1:]

                df = pd.DataFrame(data, columns=headers)
                df.dropna(how='all', axis=0, inplace=True) 
                df.dropna(how='all', axis=1, inplace=True)
                df = df.replace(r'^\s*$', None, regex=True)
                df = df.replace({np.nan: None})

                final_json_context[title] = df.to_dict(orient='records')

            if not final_json_context:
                raise Exception("Nenhum dado válido encontrado nas abas da planilha.")

            return final_json_context

        except Exception as e:
            logger.error(f"Sheets: Erro ao processar planilha ID {spreadsheet_id}: {e}", exc_info=True)
            if "403" in str(e):
                raise Exception("Erro de Permissão (403). Você compartilhou a planilha com o email da Service Account?")
            if "404" in str(e):
                raise Exception("Planilha não encontrada (404). Verifique o ID.")
            raise Exception(f"Erro ao ler planilha: {str(e)}")