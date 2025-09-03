import google.generativeai as genai
from app.core.config import settings
import logging
import json
from datetime import datetime
from typing import Optional
from app.db import models

logger = logging.getLogger(__name__)

class GeminiService:
    def __init__(self):
        try:
            genai.configure(api_key=settings.GOOGLE_API_KEY)
            self.model = genai.GenerativeModel('gemini-2.5-flash')
            logger.info("✅ Cliente Gemini inicializado com sucesso.")
        except Exception as e:
            logger.error(f"🚨 ERRO CRÍTICO ao configurar o Gemini: {e}")
            raise

    def _replace_variables(self, text: str, contact_data: models.Contact) -> str:
        # (código existente, sem alterações)
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

    # --- FUNÇÃO ATUALIZADA ---
    def generate_initial_message(self, config: models.Config, contact: models.Contact, history: Optional[str] = None) -> dict:
        """Gera a mensagem inicial ou de reengajamento, considerando um histórico pré-existente."""
        persona_prompt = self._replace_variables(config.persona, contact)
        message_prompt_template = self._replace_variables(config.prompt, contact)

        if history:
            task_instruction = f"""
            Existe um histórico de conversa anterior com este contato, que talvez não esteja relacionado a esta campanha.
            **Histórico Anterior:**
            {history}
            
            Sua tarefa é reengajar o contato de forma natural, conectando a conversa anterior com o objetivo da campanha atual, que é: "{message_prompt_template}".
            Crie uma mensagem de continuação que seja educada e relevante.
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
        - Não adicione saudações como "Olá" se o modelo já as contiver.

        **Formato da Resposta:**
        Responda APENAS com um objeto JSON contendo a chave "mensagem_para_enviar".
        Exemplo: {{ "mensagem_para_enviar": "Olá, {contact.nome}! Vi que conversamos antes sobre X..." }}
        """
        try:
            response = self.model.generate_content(prompt)
            clean_response = response.text.strip().replace("```json", "").replace("```", "")
            return json.loads(clean_response)
        except Exception as e:
            logger.error(f"Erro ao gerar mensagem inicial com Gemini: {e}")
            return {"mensagem_para_enviar": None}

    # --- FUNÇÃO ATUALIZADA ---
    def generate_reply_message(self, config: models.Config, contact: models.Contact, history: str) -> dict:
        """Gera uma RESPOSTA para um contato, com base no histórico da conversa."""
        persona_prompt = self._replace_variables(config.persona, contact)

        prompt = f"""
        **Sua Persona:**
        {persona_prompt}

        **Histórico da Conversa com '{contact.nome}':**
        {history}

        **Sua Tarefa:**
        Você é um agente de prospecção. A última mensagem foi do contato. Analise o histórico e decida a melhor ação.
        - Se for uma pergunta, responda-a de forma concisa.
        - Se o contato pedir para parar, agradeça e sugira encerrar.
        - Se a conversa chegou a um ponto de agendamento, sugira horários.
        - Se a última mensagem foi sua e o contato apenas confirmou algo (ex: "ok", "sim"), talvez seja melhor esperar.
        - Seu objetivo final é avançar na prospecção.

        **Formato da Resposta:**
        Responda APENAS com um objeto JSON contendo duas chaves:
        1. "mensagem_para_enviar": A resposta em texto. Se decidir que a melhor ação é esperar, o valor deve ser null.
        2. "nova_situacao": Um novo status para o contato. Pode ser "Aguardando Resposta", "Reunião Agendada", "Não Interessado", "Concluído", "Lead Qualificado".

        Exemplo de Ação:
        {{
            "mensagem_para_enviar": "Claro! Que tal amanhã às 10h ou às 15h?",
            "nova_situacao": "Agendando Reunião"
        }}
        Exemplo de Espera:
        {{
            "mensagem_para_enviar": null,
            "nova_situacao": "Aguardando Ação do Contato"
        }}
        """
        try:
            response = self.model.generate_content(prompt)
            clean_response = response.text.strip().replace("```json", "").replace("```", "")
            return json.loads(clean_response)
        except Exception as e:
            logger.error(f"Erro ao gerar resposta com Gemini: {e}")
            return {"mensagem_para_enviar": None, "nova_situacao": "Erro IA"}

_gemini_service_instance = None
def get_gemini_service():
    global _gemini_service_instance
    if _gemini_service_instance is None:
        _gemini_service_instance = GeminiService()
    return _gemini_service_instance

