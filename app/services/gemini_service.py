import google.generativeai as genai
from app.core.config import settings
import logging
import json
from datetime import datetime
from typing import Optional, List
from app.db import models

logger = logging.getLogger(__name__)

class GeminiService:
    def __init__(self):
        try:
            genai.configure(api_key=settings.GOOGLE_API_KEY)
            self.model = genai.GenerativeModel('gemini-2.5-flash')
            logger.info("✅ Cliente Gemini inicializado com sucesso (gemini-2.5-flash).")
        except Exception as e:
            logger.error(f"🚨 ERRO CRÍTICO ao configurar o Gemini: {e}")
            raise

    def _replace_variables(self, text: str, contact_data: models.Contact) -> str:
        now = datetime.now()
        days_in_portuguese = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"]
        first_name = contact_data.nome.split(" ")[0] if contact_data.nome else ""
        replacements = {
            "{{nome_contato}}": first_name,
            "{{data_atual}}": now.strftime("%d/%m/%Y"),
            "{{dia_semana}}": days_in_portuguese[now.weekday()],
        }
        for var, value in replacements.items():
            text = text.replace(var, value)
        return text

    def _format_api_history_to_gemini_chat(self, raw_history: List[dict]) -> List[dict]:
        """
        Converte o histórico bruto da API do WhatsApp para o formato de chat do Gemini,
        extraindo texto e placeholders de mídia.
        """
        gemini_history = []
        logger.info(f"DEBUG: Formatando {len(raw_history)} mensagens brutas para o Gemini.")
        for msg in raw_history:
            role = "model" if msg.get("key", {}).get("fromMe") else "user"
            message_content = msg.get("message", {})
            
            content_text = ""
            if message_content.get('conversation') or message_content.get('extendedTextMessage'):
                content_text = message_content.get('conversation') or message_content.get('extendedTextMessage', {}).get('text', '')
            elif message_content.get("imageMessage"):
                content_text = "[Imagem Recebida]"
            elif message_content.get("audioMessage"):
                content_text = "[Áudio Recebido]"
            elif message_content.get("documentMessage"):
                file_name = message_content.get("documentMessage", {}).get("fileName", "documento")
                content_text = f"[Documento Recebido: {file_name}]"
            
            if content_text.strip():
                gemini_history.append({
                    "role": role,
                    "parts": [{"text": content_text}]
                })
        logger.info(f"DEBUG: Histórico formatado contém {len(gemini_history)} mensagens para a IA.")
        return gemini_history

    def generate_initial_message(self, config: models.Config, contact: models.Contact, history_from_api: Optional[List[dict]] = None) -> dict:
        """Gera a mensagem inicial, considerando um histórico de texto pré-existente."""
        persona_prompt = self._replace_variables(config.persona, contact)
        message_prompt_template = self._replace_variables(config.prompt, contact)
        
        task_instruction = ""
        if history_from_api:
            history_lines = []
            for msg in history_from_api: # O histórico já vem formatado
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

        **Formato OBRIGATÓRIO:**
        Responda APENAS com um objeto JSON contendo a chave "mensagem_para_enviar".
        """
        try:
            response = self.model.generate_content(prompt)
            clean_response = response.text.strip().replace("```json", "").replace("```", "")
            return json.loads(clean_response)
        except Exception as e:
            logger.error(f"Erro ao gerar mensagem inicial com Gemini: {e}")
            return {"mensagem_para_enviar": None}

    def generate_reply_message(
        self, 
        config: models.Config, 
        contact: models.Contact, 
        conversation_history_raw: List[dict],
        media_input: Optional[dict] = None
    ) -> dict:
        """
        Gera uma resposta usando o histórico de chat estruturado e possível mídia.
        """
        persona_prompt = self._replace_variables(config.persona, contact)
        # --- CORREÇÃO: Adicionando o prompt do objetivo da campanha ---
        objective_prompt = self._replace_variables(config.prompt, contact)

        if media_input:
            task_instruction = "A última mensagem do contato continha mídia (imagem, áudio ou PDF). Analise o arquivo no contexto da conversa e responda de forma relevante."
        else:
            task_instruction = "A última mensagem do contato foi em texto. Analise o histórico e responda."

        system_instruction = f"""
        **Sua Persona:**
        {persona_prompt}

        **Objetivo Principal da Campanha:**
        {objective_prompt}

        **Sua Tarefa:**
        Você é um agente de prospecção. {task_instruction} Com base no histórico de conversa e no objetivo principal, decida a melhor ação:
        - Se for uma pergunta, responda-a de forma concisa, sempre alinhado ao objetivo.
        - Se o contato pedir para parar, agradeça e sugira encerrar.
        - Se a conversa chegou a um ponto de agendamento, sugira horários.
        - Se a última mensagem foi sua e o contato apenas confirmou algo (ex: "ok", "sim"), talvez seja melhor esperar.
        - Seu objetivo final é avançar na prospecção.

        **Formato OBRIGATÓRIO da Resposta:**
        Responda APENAS com um objeto JSON válido com TRÊS chaves:
        1. "mensagem_para_enviar": A resposta em texto. Se decidir esperar, o valor deve ser null.
        2. "nova_situacao": Um novo status para o contato (ex: "Aguardando Resposta", "Reunião Agendada").
        3. "observacoes": Um resumo da interação para salvar internamente (ex: "Cliente enviou PDF com a planta.").
        """
        
        model_with_system_prompt = genai.GenerativeModel(
            model_name='gemini-2.5-flash',
            system_instruction=system_instruction
        )

        final_contents = self._format_api_history_to_gemini_chat(conversation_history_raw)

        if media_input and final_contents:
            final_contents[-1]["parts"].append(media_input)

        try:
            if not final_contents:
                 raise ValueError("O histórico da conversa está vazio e não pode ser enviado para a IA.")

            response = model_with_system_prompt.generate_content(final_contents)
            
            text_response = response.text
            start_index = text_response.find('{')
            end_index = text_response.rfind('}')
            if start_index == -1 or end_index == -1:
                raise ValueError(f"Não foi possível encontrar um objeto JSON na resposta: {text_response}")

            json_string = text_response[start_index : end_index + 1]
            return json.loads(json_string)
            
        except Exception as e:
            logger.error(f"Erro ao gerar resposta com Gemini: {e}")
            return {"mensagem_para_enviar": None, "nova_situacao": "Erro IA", "observacoes": f"Falha da IA: {e}"}

_gemini_service_instance = None
def get_gemini_service():
    global _gemini_service_instance
    if _gemini_service_instance is None:
        _gemini_service_instance = GeminiService()
    return _gemini_service_instance

