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
            self.generation_config = {"temperature": 0.5, "top_p": 1, "top_k": 1}
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
            role = "ia" if msg.get("role") == "assistant" else "contato"
            content = msg.get("content", "")
            history_for_ia.append({"remetente": role, "mensagem": content})
        return history_for_ia

    # --- FUNÇÃO AUXILIAR PARA TRANSCRIÇÃO REINTEGRADA ---
    def _format_db_history_to_string(self, db_history: List[dict]) -> str:
        """Formata o histórico para uma string simples, usada no contexto de análise de imagem."""
        history_lines = []
        for msg in db_history:
            role_text = "Eu" if msg.get("role") == "assistant" else "Contato"
            content = msg.get("content", "")
            history_lines.append(f"- {role_text}: {content}")
        return "\n".join(history_lines)

    # --- FUNÇÃO 'transcribe_and_analyze_media' REINTEGRADA ---
    def transcribe_and_analyze_media(self, media_data: dict, db_history: List[dict]) -> str:
        """Transcreve áudio ou analisa imagem/documento no contexto da conversa."""
        logger.info(f"Iniciando transcrição/análise para mídia do tipo {media_data.get('mime_type')}")
        
        prompt_parts = []
        
        # Lógica para transcrever áudio
        if 'audio' in media_data['mime_type']:
            task = "Sua única tarefa é transcrever o áudio a seguir. Retorne apenas o texto transcrito, sem adicionar nenhuma outra palavra ou formatação."
            prompt_parts.append(task)
            prompt_parts.append(media_data)
        
        # Lógica para analisar imagens ou documentos
        else:
            history_string = self._format_db_history_to_string(db_history)
            task = f"""
            **Contexto da Conversa Anterior:**
            {history_string}

            **Sua Tarefa:**
            Você recebeu um arquivo (imagem ou documento) do contato. Analise o conteúdo do arquivo no contexto da conversa acima.
            Sua resposta deve ser um resumo conciso, direto e útil do conteúdo, como se fosse uma anotação para o CRM.
            Exemplo se for uma planta baixa: "O contato enviou a planta do banheiro, destacando a área do box."
            Exemplo se for um catálogo: "O contato enviou um catálogo de produtos."
            Retorne APENAS o texto do resumo.
            """
            prompt_parts.append(task)
            prompt_parts.append(media_data)

        try:
            # Reutiliza o modelo principal da classe, que é multimodal
            response = self._generate_with_retry(prompt_parts)
            
            transcription = response.text.strip()
            logger.info(f"Transcrição/Análise gerada: '{transcription[:100]}...'")
            return transcription
        except Exception as e:
            logger.error(f"Erro ao transcrever/analisar mídia: {e}")
            return f"[Erro ao processar mídia: {media_data.get('mime_type')}]"

    def generate_conversation_action(
        self,
        config: models.Config,
        contact: models.Contact,
        conversation_history_db: List[dict],
        mode: str
    ) -> dict:
        """
        Função unificada que constrói um ÚNICO prompt JSON com todas as instruções.
        """
        try:
            campaign_config = self._replace_variables_in_dict(config.prompt_config, contact)
            task_map = {
                'initial': "Gerar a PRIMEIRA mensagem de prospecção para iniciar a conversa.",
                'reply': "Analisar a última mensagem do contato e formular a PRÓXIMA resposta para avançar na conversa.",
                'followup': "Analisar as mensagens e decidir entre continuar o fluxo, fazer um follow-up ou se não é necessário mais nada apenas retorne 'null' no campo 'mensagem_para_enviar"
            }
            formatted_history = self._format_history_for_prompt(conversation_history_db)

            master_prompt = {
                "instrucao_geral": "Você é um assistente de prospecção e vendas. Sua tarefa é analisar todo este JSON e retornar sua resposta.",
                "formato_resposta_obrigatorio": {
                    "descricao": "Sua resposta DEVE ser um único objeto JSON válido, sem nenhum texto ou formatação adicional (como ```json). O objeto deve conter EXATAMENTE as três chaves a seguir:",
                    "chaves": {
                        "mensagem_para_enviar": "O texto da mensagem a ser enviada ao contato. Se decidir que não deve enviar uma mensagem agora, o valor deve ser null.",
                        "nova_situacao": "Um status curto que descreva o estado atual da conversa (ex: 'Aguardando Resposta', 'Reunião Agendada', 'Lead Qualificado').",
                        "observacoes": "Um resumo interno e conciso da interação para salvar no CRM (ex: 'Contato demonstrou interesse no produto X.')."
                    },
                    "regra_importante_variaveis": "CRÍTICO: NUNCA inclua placeholders ou variáveis como `{{nome_contato}}` ou `[alguma informação]` no campo `mensagem_para_enviar`. O texto deve ser a mensagem final e completa, pronta para ser enviada diretamente ao cliente, pois as variáveis já foram substituídas."
                },
                "configuracao_campanha": campaign_config,
                "dados_atuais_conversa": {
                    "contato_nome": contact.nome,
                    "tarefa_imediata": task_map.get(mode, "Continuar a conversa de forma coerente."),
                    "historico_conversa": formatted_history
                }
            }

            final_prompt_str = json.dumps(master_prompt, ensure_ascii=False, indent=2)
            response = self._generate_with_retry(final_prompt_str)
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