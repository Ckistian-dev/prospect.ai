import google.generativeai as genai
from google.api_core import exceptions # <-- IMPORTANTE: para capturar o erro específico
import time # <-- IMPORTANTE: para a lógica de espera
from app.core.config import settings
import logging
import json
import re # <-- IMPORTANTE: para extrair o tempo de espera do erro
from datetime import datetime
from typing import Optional, List
from app.db import models

logger = logging.getLogger(__name__)

class GeminiService:
    def __init__(self):
        try:
            genai.configure(api_key=settings.GOOGLE_API_KEY)

            self.generation_config = {
                "temperature": 0.75,
                "top_p": 1,
                "top_k": 1,
            }

            # Corrigido para o nome de modelo correto gemini-2.5-flash
            self.model = genai.GenerativeModel(
                model_name='gemini-2.5-flash', # Atenção: O modelo 'gemini-2.5-flash' não existe, o correto é 'gemini-2.5-flash'
                generation_config=self.generation_config
            )
            
            logger.info("✅ Cliente Gemini inicializado com sucesso (gemini-2.5-flash).")
        except Exception as e:
            logger.error(f"🚨 ERRO CRÍTICO ao configurar o Gemini: {e}")
            raise

    # --- NOVA LÓGICA DE RETENTATIVA ---
    def _generate_with_retry(self, model: genai.GenerativeModel, prompt: any, max_retries: int = 3) -> genai.types.GenerateContentResponse:
        """
        Executa a chamada para a API Gemini com uma lógica de retentativa para erros de quota (429).
        """
        attempt = 0
        while attempt < max_retries:
            try:
                # Tenta gerar o conteúdo
                return model.generate_content(prompt)
            except exceptions.ResourceExhausted as e:
                attempt += 1
                logger.warning(f"Quota da API excedida (429). Tentativa {attempt}/{max_retries}.")
                
                # Extrai o tempo de espera sugerido pela API a partir da mensagem de erro
                # O padrão busca por "retry_delay { seconds: XX }"
                match = re.search(r"retry_delay {\s*seconds: (\d+)\s*}", str(e))
                
                if match:
                    wait_time = int(match.group(1))
                    logger.info(f"API sugeriu aguardar {wait_time} segundos. Aguardando...")
                    # Adiciona uma pequena margem para segurança
                    time.sleep(wait_time + 2) 
                else:
                    # Se não encontrar a sugestão, usa um tempo de espera exponencial
                    wait_time = (2 ** attempt) * 5 
                    logger.warning(f"Não foi possível extrair o 'retry_delay'. Usando espera exponencial: {wait_time}s.")
                    time.sleep(wait_time)
            
            except Exception as e:
                 # Para outros tipos de erro, não tenta novamente e lança a exceção
                logger.error(f"Erro inesperado ao gerar conteúdo com Gemini: {e}")
                raise e

        # Se todas as tentativas falharem, lança uma exceção final
        raise Exception(f"Não foi possível obter uma resposta da API Gemini após {max_retries} tentativas.")


    def _replace_variables(self, text: str, contact_data: models.Contact) -> str:
        """Substitui variáveis dinâmicas no texto, incluindo as novas observações."""
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
            text = text.replace(var, value)
        return text

    def _format_db_history_to_string(self, db_history: List[dict]) -> str:
        history_lines = []
        for msg in db_history:
            role_text = "Eu" if msg.get("role") == "assistant" else "Contato"
            content = msg.get("content", "")
            history_lines.append(f"- {role_text}: {content}")
        return "\n".join(history_lines)

    def transcribe_and_analyze_media(self, media_data: dict, db_history: List[dict]) -> str:
        """Transcreve áudio ou analisa imagem/documento no contexto da conversa."""
        logger.info(f"DEBUG: Iniciando transcrição/análise para mídia do tipo {media_data.get('mime_type')}")
        
        prompt_parts = []
        
        if 'audio' in media_data['mime_type']:
            task = "Sua única tarefa é transcrever o áudio a seguir. Retorne apenas o texto transcrito, sem adicionar nenhuma outra palavra ou formatação."
            prompt_parts.append(task)
            prompt_parts.append(media_data)
        else:
            history_string = self._format_db_history_to_string(db_history)
            task = f"""
            **Contexto da Conversa Anterior:**
            {history_string}

            **Sua Tarefa:**
            Você recebeu um arquivo (imagem ou documento) do contato. Analise o conteúdo do arquivo no contexto da conversa acima.
            Sua resposta deve ser um resumo conciso, direto e útil do conteúdo, como se fosse uma anotação.
            Exemplo se for uma planta baixa: "O contato enviou a planta do banheiro, destacando a área do box."
            Exemplo se for um catálogo: "O contato enviou um catálogo de produtos."
            Retorne APENAS o texto do resumo.
            """
            prompt_parts.append(task)
            prompt_parts.append(media_data)

        try:
            media_model = genai.GenerativeModel('gemini-2.5-flash', generation_config=self.generation_config)
            
            # --- MODIFICADO: Usa a nova função com retentativa ---
            response = self._generate_with_retry(media_model, prompt_parts)
            
            transcription = response.text.strip()
            logger.info(f"DEBUG: Transcrição/Análise gerada: '{transcription[:100]}...'")
            return transcription
        except Exception as e:
            logger.error(f"Erro ao transcrever/analisar mídia após todas as tentativas: {e}")
            return f"[Erro ao processar mídia: {media_data.get('mime_type')}]"

    def generate_initial_message(self, config: models.Config, contact: models.Contact, history_from_api: Optional[List[dict]] = None) -> dict:
        """Gera a mensagem inicial, considerando um histórico de texto pré-existente."""
        # (O resto da sua lógica para montar o prompt continua igual)
        persona_prompt = self._replace_variables(config.persona, contact)
        message_prompt_template = self._replace_variables(config.prompt, contact)
        
        task_instruction = ""
        if history_from_api:
            history_lines = []
            for msg in history_from_api:
                role_text = "Eu" if msg.get("key", {}).get("fromMe") else "Contato"
                message_content = msg.get("message", {})
                text = message_content.get('conversation') or message_content.get('extendedTextMessage', {}).get('text', '[Mídia]')
                history_lines.append(f"- {role_text}: {text}")

            history_text_for_prompt = "\n".join(history_lines)
            task_instruction = f"""
            Existe um histórico de conversa anterior. Sua tarefa é reengajar o contato, conectando a conversa anterior com o objetivo da campanha atual: "{message_prompt_template}".
            **Histórico Anterior:**
            {history_text_for_prompt}
            """
        else:
            task_instruction = f"Sua tarefa é gerar a PRIMEIRA mensagem de prospecção, usando como base: {message_prompt_template}"

        prompt = f"""
        **Sua Persona:**
        {persona_prompt}

        **Sua Tarefa:**
        {task_instruction}
        
        **Regra Principal:** Seja amigável, direto e humano. Evite soar como um robô.

        **Formato OBRIGATÓRIO:**
        Responda APENAS com um objeto JSON contendo a chave "mensagem_para_enviar".
        """
        try:
            # --- MODIFICADO: Usa a nova função com retentativa ---
            response = self._generate_with_retry(self.model, prompt)
            
            clean_response = response.text.strip().replace("```json", "").replace("```", "")
            return json.loads(clean_response)
        except Exception as e:
            logger.error(f"Erro ao gerar mensagem inicial com Gemini após todas as tentativas: {e}")
            return {"mensagem_para_enviar": None}

    def generate_reply_message(self, config: models.Config, contact: models.Contact, conversation_history_db: List[dict]) -> dict:
        """Gera uma resposta com base no histórico do DB (que já contém transcrições)."""
        # (O resto da sua lógica para montar o prompt continua igual)
        persona_prompt = self._replace_variables(config.persona, contact)
        objective_prompt = self._replace_variables(config.prompt, contact)
        history_string = self._format_db_history_to_string(conversation_history_db)

        system_instruction = f"""
        **Sua Persona:**
        {persona_prompt}

        **Objetivo Principal da Campanha:**
        {objective_prompt}

        **Histórico da Conversa com '{contact.nome}':**
        {history_string}

        **Sua Tarefa:**
        Você é um agente de prospecção. Com base no histórico ACIMA, formule a PRÓXIMA resposta.
        
        **REGRAS DE OURO PARA A RESPOSTA:**
        1.  **SEJA DIRETO E CONCISO:** Vá direto ao ponto. Evite enrolação e frases de preenchimento.
        2.  **SOE HUMANO:** Use uma linguagem natural e casual. Não pareça um robô.
        3.  **NÃO REPITA INFORMAÇÕES:** O contato já sabe do que se trata, não repita o objetivo da campanha a cada mensagem.
        4.  **AVANCE A CONVERSA:** Sua resposta deve sempre tentar avançar na prospecção (responder pergunta, sugerir agendamento, etc.), a menos que o contato peça para parar.

        **Formato OBRIGATÓRIO da Resposta:**
        Responda APENAS com um objeto JSON válido com TRÊS chaves:
        1. "mensagem_para_enviar": A resposta em texto. Se decidir esperar, o valor deve ser null.
        2. "nova_situacao": Um novo status para o contato (ex: "Aguardando Resposta", "Reunião Agendada").
        3. "observacoes": Um resumo da interação para salvar internamente (ex: "Cliente demonstrou interesse em agendar.").
        """
        
        final_prompt = "Com base em todas as instruções e no histórico fornecido, gere a resposta em JSON agora."

        try:
            model_with_system_prompt = genai.GenerativeModel(
                model_name='gemini-2.5-flash',
                system_instruction=system_instruction,
                generation_config=self.generation_config
            )

            # --- MODIFICADO: Usa a nova função com retentativa ---
            response = self._generate_with_retry(model_with_system_prompt, final_prompt)
            
            text_response = response.text
            start_index = text_response.find('{')
            end_index = text_response.rfind('}')
            if start_index == -1 or end_index == -1:
                raise ValueError(f"Não foi possível encontrar um objeto JSON na resposta: {text_response}")

            json_string = text_response[start_index : end_index + 1]
            return json.loads(json_string)
            
        except Exception as e:
            logger.error(f"Erro ao gerar resposta com Gemini após todas as tentativas: {e}")
            return {"mensagem_para_enviar": None, "nova_situacao": "Erro IA", "observacoes": f"Falha da IA: {e}"}

    def generate_followup_message(self, config: models.Config, contact: models.Contact, history: List[dict]) -> dict:
        """Gera uma mensagem de follow-up para um contato que não respondeu."""
        # (O resto da sua lógica para montar o prompt continua igual)
        persona_prompt = self._replace_variables(config.persona, contact)
        objective_prompt = self._replace_variables(config.prompt, contact)
        history_str = self._format_db_history_to_string(history)
        
        prompt = f"""
        **Sua Persona:**
        {persona_prompt}
        
        **Objetivo Principal da Campanha:**
        {objective_prompt}

        **Histórico da Conversa com '{contact.nome}':**
        {history_str}

        **Sua Tarefa:**
        A última mensagem foi sua e o contato não respondeu.
        Sua tarefa é gerar uma mensagem de follow-up **curta, direta e amigável** para reengajar a conversa. Não seja insistente.
        Vá direto ao ponto, perguntando se ele teve tempo de ver a mensagem anterior ou se ainda tem interesse.

        **Formato OBRIGATÓRIO da Resposta:**
        Responda APENAS com um objeto JSON válido com DUAS chaves:
        1. "mensagem_para_enviar": A mensagem de follow-up.
        2. "nova_situacao": O novo status, que deve ser "Aguardando Resposta".
        
        Exemplo:
        {{
            "mensagem_para_enviar": "Oi, {contact.nome}! Tudo bem? Só passando pra saber se você conseguiu ver minha mensagem anterior. 😉",
            "nova_situacao": "Aguardando Resposta"
        }}
        """
        try:
            # --- MODIFICADO: Usa a nova função com retentativa ---
            response = self._generate_with_retry(self.model, prompt)

            clean_response = response.text.strip().replace("```json", "").replace("```", "")
            return json.loads(clean_response)
        except Exception as e:
            logger.error(f"Erro ao gerar follow-up com Gemini após todas as tentativas: {e}")
            return {"mensagem_para_enviar": None, "nova_situacao": "Erro IA"}

_gemini_service_instance = None
def get_gemini_service():
    global _gemini_service_instance
    if _gemini_service_instance is None:
        _gemini_service_instance = GeminiService()
    return _gemini_service_instance