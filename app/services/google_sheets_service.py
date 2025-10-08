import httpx
import pandas as pd
import io
import logging
from typing import Dict, List, Any
import numpy as np

logger = logging.getLogger(__name__)

class GoogleSheetsService:
    async def get_csv_sheet_as_json(self, spreadsheet_url: str) -> List[Dict[str, Any]]:
        """
        Busca um arquivo .csv publicado do Google Sheets e converte para uma lista de dicionários.
        """
        # --- CORREÇÃO AQUI ---
        # A validação agora é mais flexível e verifica apenas se 'output=csv' está presente.
        if "output=csv" not in spreadsheet_url:
            raise Exception("URL inválida. Use o link de publicação 'Valores separados por vírgula (.csv)'.")

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(spreadsheet_url, follow_redirects=True, timeout=30.0)
                response.raise_for_status()

                csv_data = io.StringIO(response.text)
                df = pd.read_csv(csv_data)

                # Renomeia colunas para garantir consistência (ex: 'Nome' -> 'nome')
                df.columns = [col.strip().lower() for col in df.columns]
                
                # Garante que as colunas essenciais existam
                required_columns = ['nome', 'whatsapp']
                if not all(col in df.columns for col in required_columns):
                    raise Exception(f"A planilha deve conter as colunas: {', '.join(required_columns)}.")

                # Substitui valores nulos do pandas (NaN) por None para conversão correta para JSON
                df.replace({np.nan: None}, inplace=True)
                
                # Garante que 'categoria' seja uma lista, mesmo que vazia ou nula
                if 'categoria' not in df.columns:
                    df['categoria'] = [[] for _ in range(len(df))]
                else:
                    df['categoria'] = df['categoria'].apply(
                        lambda x: [cat.strip() for cat in x.split(',')] if isinstance(x, str) else []
                    )

                return df.to_dict(orient='records')

            except Exception as e:
                logger.error(f"Erro geral no serviço Google Sheets (CSV): {e}", exc_info=True)
                raise Exception(f"Erro ao processar a planilha CSV: {str(e)}")

