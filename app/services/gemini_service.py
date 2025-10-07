import google.generativeai as genai
from google.api_core import exceptions
import time
import logging
import json
import re
from datetime import datetime
from typing import Optional, List, Dict, Any
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db import models
from app.crud import crud_user # Import necessário para a função de débito

logger = logging.getLogger(__name__)

class GeminiService:
    def __init__(self):
        try:
            self.api_keys = [key.strip() for key in settings.GOOGLE_API_KEYS.split(',') if key.strip()]
            if not self.api_keys:
                raise ValueError("Nenhuma chave de API do Google foi encontrada na variável GOOGLE_API_KEYS.")
            
            self.current_key_index = 0
            self.generation_config = {"temperature": 0.5, "top_p": 1, "top_k": 1}
            
            logger.info(f"✅ Cliente Gemini inicializado com {len(self.api_keys)} chaves de API.")
        except Exception as e:
            logger.error(f"🚨 ERRO CRÍTICO ao configurar o Gemini: {e}")
            raise

    # --- MÉTODO ATUALIZADO PARA RECEBER DB E USER E DEBITAR O TOKEN ---
    async def _generate_with_retry_async(
        self, 
        prompt: Any, 
        db: AsyncSession, 
        user: models.User, 
        force_json: bool = True
    ) -> genai.types.GenerateContentResponse:
        """
        Executa a chamada assíncrona para a API Gemini, com rotação de chaves e débito de token no sucesso.
        """
        for i in range(len(self.api_keys)):
            try:
                key_to_use = self.api_keys[self.current_key_index]
                genai.configure(api_key=key_to_use)
                model = genai.GenerativeModel('gemini-2.5-flash')

                gen_config = self.generation_config
                if force_json:
                    gen_config = {**self.generation_config, "response_mime_type": "application/json"}

                response = await model.generate_content_async(prompt, generation_config=gen_config)
                
                # --- LÓGICA DE DÉBITO CENTRALIZADA ---
                # Se a chamada foi bem-sucedida, debita 1 token do usuário.
                await crud_user.decrement_user_tokens(db, db_user=user, amount=1)
                
                return response

            except exceptions.ResourceExhausted as e:
                logger.warning(f"Chave de API índice {self.current_key_index} ({key_to_use[:4]}...) atingiu a quota. Rotacionando...")
                self.current_key_index = (self.current_key_index + 1) % len(self.api_keys)
                if i < len(self.api_keys) - 1:
                    await asyncio.sleep(1)

            except Exception as e:
                logger.error(f"Erro inesperado ao gerar conteúdo com Gemini na chave índice {self.current_key_index}: {e}")
                raise e

        raise exceptions.ResourceExhausted(f"Todas as {len(self.api_keys)} chaves de API atingiram a quota.")


    def _replace_variables_in_dict(self, config_dict: Dict[str, Any], contact_data: models.Contact) -> Dict[str, Any]:
        # (Este método não muda)
        config_str = json.dumps(config_dict)
        now = datetime.now()
        days_in_portuguese = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"]
        first_name = contact_data.nome.split(" ")[0] if contact_data.nome else ""
        
        replacements = {
            "{{nome_contato}}": first_name,
            "{{data_atual}}": now.strftime("%d/%m/%Y"),
            "{{dia_semana}}": days_in_portuguese[now.weekday()],
            "{{observacoes_contato}}": contact_data.observacoes or ""
        }
        
        for var, value in replacements.items():
            config_str = config_str.replace(var, value)
        
        return json.loads(config_str)

    def _format_history_for_prompt(self, db_history: List[dict]) -> List[Dict[str, str]]:
        # (Este método não muda)
        history_for_ia = []
        for msg in db_history:
            role = "ia" if msg.get("role") == "assistant" else "contato"
            content = msg.get("content", "")
            history_for_ia.append({"remetente": role, "mensagem": content})
        return history_for_ia

    # --- ASSINATURA ATUALIZADA PARA PASSAR DB E USER ---
    async def transcribe_and_analyze_media(
        self, 
        media_data: dict, 
        db_history: List[dict], 
        config: models.Config,
        db: AsyncSession,
        user: models.User
    ) -> str:
        logger.info(f"Iniciando transcrição/análise para mídia do tipo {media_data.get('mime_type')}")
        prompt_parts = []
        
        if 'audio' in media_data['mime_type']:
            task = "Sua única tarefa é transcrever o áudio a seguir. Retorne apenas o texto transcrito, sem adicionar nenhuma outra palavra ou formatação."
            prompt_parts.append(task)
            prompt_parts.append(media_data)
            try:
                response = await self._generate_with_retry_async(prompt_parts, db, user, force_json=False)
                transcription = response.text.strip()
                logger.info(f"Transcrição de áudio gerada: '{transcription[:100]}...'")
                return transcription
            except Exception as e:
                logger.error(f"Erro ao transcrever áudio: {e}")
                return f"[Erro ao processar áudio: {media_data.get('mime_type')}]"

        else:
            formatted_history = self._format_history_for_prompt(db_history)
            analysis_prompt = {
                "instrucao_geral": "Você é um assistente de vendas analisando um arquivo enviado por um contato...",
                "formato_resposta_obrigatorio": {
                    "descricao": "Sua resposta DEVE ser um único objeto JSON válido contendo a chave 'resumo'.",
                    "chaves": {"resumo": "Um texto curto e objetivo que descreve o conteúdo do arquivo..."}
                },
                "configuracao_persona": config.prompt_config,
                "dados_atuais_conversa": {"historico_conversa": formatted_history},
                "tarefa_imediata": "Analise o arquivo a seguir e retorne o resumo em formato JSON..."
            }

            prompt_parts.append(json.dumps(analysis_prompt, ensure_ascii=False, indent=2))
            prompt_parts.append(media_data)

            try:
                response = await self._generate_with_retry_async(prompt_parts, db, user, force_json=True)
                response_json = json.loads(response.text)
                analysis = response_json.get("resumo", "[Não foi possível extrair o resumo da análise]").strip()
                logger.info(f"Análise de mídia gerada: '{analysis[:100]}...'")
                return analysis
            except Exception as e:
                logger.error(f"Erro ao analisar mídia com prompt JSON: {e}")
                return f"[Erro ao processar mídia: {media_data.get('mime_type')}]"

    # --- ASSINATURA ATUALIZADA PARA PASSAR DB E USER ---
    async def generate_conversation_action(
        self,
        config: models.Config,
        contact: models.Contact,
        conversation_history_db: List[dict],
        mode: str,
        db: AsyncSession,
        user: models.User
    ) -> dict:
        try:
            # ... (lógica interna do prompt permanece a mesma)
            campaign_config = self._replace_variables_in_dict(config.prompt_config, contact)
            task_map = {
                'initial': "Gerar a primeira mensagem de prospecção para iniciar a conversa, caso ela já não tenha iniciado.",
                'reply': "Analisar a última mensagem do contato e formular a PRÓXIMA resposta para avançar na conversa.",
                'followup': "Analisar as mensagens e decidir entre continuar o fluxo, fazer um follow-up ou se não é necessário mais nada apenas retorne 'null' no campo 'mensagem_para_enviar"
            }
            formatted_history = self._format_history_for_prompt(conversation_history_db)
            master_prompt = {
                "instrucao_geral": "Você é um assistente de prospecção e vendas...",
                "formato_resposta_obrigatorio": {
                    "descricao": "Sua resposta DEVE ser um único objeto JSON válido...",
                    "chaves": {
                        "mensagem_para_enviar": "...",
                        "nova_situacao": "...",
                        "observacoes": "..."
                    },
                    "regra_importante_variaveis": "CRÍTICO: NUNCA inclua placeholders..."
                },
                "configuracao_campanha": campaign_config,
                "dados_atuais_conversa": {
                    "contato_nome": contact.nome,
                    "tarefa_imediata": task_map.get(mode, "Continuar a conversa de forma coerente."),
                    "historico_conversa": formatted_history
                }
            }

            final_prompt_str = json.dumps(master_prompt, ensure_ascii=False, indent=2)
            
            # Passa 'db' e 'user' para a função de geração
            response = await self._generate_with_retry_async(final_prompt_str, db, user, force_json=True)
            
            clean_response = response.text.strip().replace("```json", "").replace("```", "")
            return json.loads(clean_response)

        except Exception as e:
            logger.error(f"Erro ao gerar ação de conversação (Modo: {mode}) com Gemini: {e}")
            return {
                "mensagem_para_enviar": None,
                "nova_situacao": "Erro IA",
                "observacoes": f"Falha da IA: {str(e)}"
            }

_gemini_service_instance = None
def get_gemini_service():
    global _gemini_service_instance
    if _gemini_service_instance is None:
        _gemini_service_instance = GeminiService()
    return _gemini_service_instance