import google.generativeai as genai
from google.api_core import exceptions
import time
import logging
import json
import re
from datetime import datetime
from typing import Optional, List, Dict, Any

from app.core.config import settings
from app.db import models

logger = logging.getLogger(__name__)

class GeminiService:
    def __init__(self):
        try:
            genai.configure(api_key=settings.GOOGLE_API_KEY)
            self.generation_config = {"temperature": 0.75, "top_p": 1, "top_k": 1}
            # CORREÇÃO: O modelo 'gemini-2.5-flash' não existe. 
            # Usei 'gemini-2.5-flash' como um substituto moderno e correto.
            self.model = genai.GenerativeModel(
                model_name='gemini-2.5-flash', 
                generation_config=self.generation_config
            )
            logger.info("✅ Cliente Gemini inicializado com sucesso (gemini-2.5-flash).")
        except Exception as e:
            logger.error(f"🚨 ERRO CRÍTICO ao configurar o Gemini: {e}")
            raise

    def _generate_with_retry(self, prompt: Any) -> genai.types.GenerateContentResponse:
        """Executa a chamada para a API Gemini com lógica de retentativa."""
        max_retries = 3
        attempt = 0
        while attempt < max_retries:
            try:
                # Agora usamos o modelo instanciado na classe
                return self.model.generate_content(prompt)
            except exceptions.ResourceExhausted as e:
                attempt += 1
                logger.warning(f"Quota da API excedida (429). Tentativa {attempt}/{max_retries}.")
                match = re.search(r"retry_delay {\s*seconds: (\d+)\s*}", str(e))
                wait_time = int(match.group(1)) + 2 if match else (2 ** attempt) * 5
                logger.info(f"Aguardando {wait_time} segundos para nova tentativa...")
                time.sleep(wait_time)
            except Exception as e:
                logger.error(f"Erro inesperado ao gerar conteúdo com Gemini: {e}")
                raise e
        raise Exception(f"Não foi possível obter uma resposta da API Gemini após {max_retries} tentativas.")

    def _replace_variables_in_dict(self, config_dict: Dict[str, Any], contact_data: models.Contact) -> Dict[str, Any]:
        """Substitui variáveis dinâmicas em toda a estrutura do dicionário de configuração."""
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
        """Formata o histórico do banco de dados para um formato simples de JSON."""
        history_for_ia = []
        for msg in db_history:
            # Simplificado para 'ia' e 'contato' para ser mais claro no prompt
            role = "ia" if msg.get("role") == "assistant" else "contato"
            content = msg.get("content", "")
            history_for_ia.append({"remetente": role, "mensagem": content})
        return history_for_ia

    def generate_conversation_action(
        self,
        config: models.Config,
        contact: models.Contact,
        conversation_history_db: List[dict],
        mode: str  # 'initial', 'reply', ou 'followup'
    ) -> dict:
        """
        Função unificada que constrói um ÚNICO prompt JSON com todas as instruções.
        """
        try:
            # 1. Substitui as variáveis dinâmicas na configuração da campanha
            campaign_config = self._replace_variables_in_dict(config.prompt_config, contact)

            # 2. Define a tarefa específica para a IA com base no modo
            task_map = {
                'initial': "Gerar a PRIMEIRA mensagem de prospecção para iniciar a conversa.",
                'reply': "Analisar a última mensagem do contato e formular a PRÓXIMA resposta para avançar na conversa.",
                'followup': "Analisar as mensagens e decidir entre continuar o fluxo, fazer um follow-up ou se não é necessário mais nada apenas retorne 'null' no campo 'mensagem_para_enviar'"
            }
            
            # 3. Formata o histórico
            formatted_history = self._format_history_for_prompt(conversation_history_db)

            # 4. ### MUDANÇA PRINCIPAL: Constrói o prompt JSON único e completo ###
            master_prompt = {
                "instrucao_geral": "Você é um assistente de prospecção e vendas. Sua tarefa é analisar todo este JSON e retornar sua resposta.",
                
                "formato_resposta_obrigatorio": {
                    "descricao": "Sua resposta DEVE ser um único objeto JSON válido, sem nenhum texto ou formatação adicional (como ```json). O objeto deve conter EXATAMENTE as três chaves a seguir:",
                    "chaves": {
                        "mensagem_para_enviar": "O texto da mensagem a ser enviada ao contato. Se decidir que não deve enviar uma mensagem agora, o valor deve ser null.",
                        "nova_situacao": "Um status curto que descreva o estado atual da conversa (ex: 'Aguardando Resposta', 'Reunião Agendada', 'Lead Qualificado', 'Contato Frio').",
                        "observacoes": "Um resumo interno e conciso da interação para salvar no CRM (ex: 'Contato demonstrou interesse no produto X e pediu orçamento.')."
                    },
                    "regra_importante_variaveis": "CRÍTICO: NUNCA inclua placeholders ou variáveis como `{{nome_contato}}` ou `[alguma informação]` no campo `mensagem_para_enviar`. O texto deve ser a mensagem final e completa, pronta para ser enviada diretamente ao cliente."
                },

                "configuracao_campanha": campaign_config,
                
                "dados_atuais_conversa": {
                    "contato_nome": contact.nome,
                    "tarefa_imediata": task_map.get(mode, "Continuar a conversa de forma coerente."),
                    "historico_conversa": formatted_history
                }
            }

            # 5. Converte o dicionário inteiro para uma string JSON
            final_prompt_str = json.dumps(master_prompt, ensure_ascii=False, indent=2)
            
            # 6. Envia o prompt para a IA (sem usar mais a instrução de sistema)
            response = self._generate_with_retry(final_prompt_str)

            # 7. Processa a resposta
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