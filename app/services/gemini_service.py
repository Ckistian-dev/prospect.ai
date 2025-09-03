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

    def _format_history_objects_to_string(self, conversation_from_db: List[dict]) -> str:
        """Converte o histórico salvo no DB (com placeholders) em uma string para o prompt."""
        history_lines = []
        for msg in conversation_from_db:
            remetente = "Eu" if msg.get("role") == "assistant" else "Contato"
            conteudo = msg.get("content", "")
            history_lines.append(f"- {remetente}: {conteudo}")
        return "\n".join(history_lines)

    def generate_initial_message(self, config: models.Config, contact: models.Contact, history_objects: Optional[List[dict]] = None) -> dict:
        """Gera a mensagem inicial, considerando um histórico de texto pré-existente."""
        persona_prompt = self._replace_variables(config.persona, contact)
        message_prompt_template = self._replace_variables(config.prompt, contact)
        
        history_text_for_prompt = ""
        if history_objects:
            # Aqui usamos o histórico do DB, que já tem o formato de role/content
            history_text_for_prompt = self._format_history_objects_to_string(history_objects)
            task_instruction = f"""
            Existe um histórico de conversa anterior com este contato.
            **Histórico Anterior:**
            {history_text_for_prompt}
            
            Sua tarefa é reengajar o contato de forma natural, conectando a conversa anterior com o objetivo da campanha atual, que é: "{message_prompt_template}".
            """
        else:
            task_instruction = f"""
            Sua tarefa é gerar a PRIMEIRA mensagem de prospecção para o contato.
            Use o seguinte modelo como base: {message_prompt_template}
            """

        prompt = f"""
        **Sua Persona:**
        {persona_prompt}

        **Sua Tarefa:**
        {task_instruction}

        **Regras Importantes:**
        - Seja breve, amigável e profissional.

        **Formato da Resposta:**
        Responda APENAS com um objeto JSON contendo a chave "mensagem_para_enviar".
        Exemplo: {{"mensagem_para_enviar": "Olá, {contact.nome}! Vi que conversamos antes sobre X..."}}
        """
        try:
            response = self.model.generate_content(prompt)
            text_response = response.text
            start_index = text_response.find('{')
            end_index = text_response.rfind('}')
            if start_index != -1 and end_index != -1:
                json_string = text_response[start_index : end_index + 1]
                return json.loads(json_string)
            else:
                raise ValueError("Nenhum JSON encontrado na resposta da IA.")
        except Exception as e:
            logger.error(f"Erro ao gerar mensagem inicial com Gemini: {e}")
            return {"mensagem_para_enviar": None}

    def generate_reply_message(
        self, 
        config: models.Config, 
        contact: models.Contact, 
        conversation_history: List[dict],
        media_input: Optional[dict] = None
    ) -> dict:
        """Gera uma resposta, considerando o histórico do DB e possível mídia na última mensagem."""
        persona_prompt = self._replace_variables(config.persona, contact)
        history_string = self._format_history_objects_to_string(conversation_history)

        prompt_parts = [
            f"**Sua Persona:**\n{persona_prompt}\n\n",
            f"**Histórico da Conversa com '{contact.nome}':**\n{history_string}\n\n",
            "**Sua Tarefa:**\nVocê é um agente de prospecção. Com base no histórico e em qualquer mídia/arquivo fornecido na ÚLTIMA mensagem, decida a melhor ação.\n"
        ]

        if media_input:
            prompt_parts.append("A última mensagem do contato continha a seguinte mídia/arquivo para sua análise:\n")
            prompt_parts.append(media_input)
            prompt_parts.append("\nAnalise o conteúdo no contexto da conversa e responda de forma relevante.\n")
        else:
            prompt_parts.append("A última mensagem do contato foi em texto. Analise o histórico e responda.\n")

        prompt_parts.append(
            """
            **Formato OBRIGATÓRIO da Resposta:**
            Responda APENAS com um objeto JSON válido contendo TRÊS chaves:
            1. "mensagem_para_enviar": A resposta em texto. Se decidir esperar, o valor deve ser null.
            2. "nova_situacao": Um novo status para o contato ("Aguardando Resposta", "Reunião Agendada", "Lead Qualificado", etc.).
            3. "observacoes": Um resumo da interação para salvar internamente.

            Exemplo (PDF):
            {
                "mensagem_para_enviar": "Recebi o catálogo. Vou verificar os itens que você mencionou e já retorno.",
                "nova_situacao": "Analisando Documento",
                "observacoes": "Cliente enviou catálogo em PDF para análise de itens."
            }
            """
        )
        
        try:
            response = self.model.generate_content(prompt_parts)
            
            if not hasattr(response, 'text') or not response.text:
                raise ValueError("A resposta da IA está vazia.")

            text_response = response.text
            start_index = text_response.find('{')
            end_index = text_response.rfind('}')

            if start_index == -1 or end_index == -1:
                raise ValueError(f"Não foi possível encontrar um objeto JSON na resposta da IA: {text_response}")

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

