import os
import re
from google import genai
from google.genai import types
from collections.abc import Set
import logging
import json
from datetime import datetime, timezone, timedelta
import base64
from typing import Optional, List, Dict, Any
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
import numpy as np

from app.core.config import settings
from app.db import models
from app.crud import crud_user # Import necessário para a função de débito
from app.services.google_calendar_service import get_google_calendar_service

logger = logging.getLogger(__name__)

class SetEncoder(json.JSONEncoder):
    """Codificador JSON para lidar com objetos 'set'."""
    def default(self, obj):
        if isinstance(obj, Set):
            return list(obj)
        return super().default(obj)

class GeminiService:
    def __init__(self):
        try:
            self.api_keys = [key.strip() for key in settings.GOOGLE_API_KEYS.split(',') if key.strip()]
            if not self.api_keys:
                raise ValueError("Nenhuma chave de API do Google foi encontrada na variável GOOGLE_API_KEYS.")
            
            self.current_key_index = 0
            self.generation_config = {
                "temperature": 0.2,
                "top_p": 0.95,
                "top_k": 40,
                "frequency_penalty": 0.6,
                "presence_penalty": 0.4
            }
            self.output_token_multiplier = 2.5 / 0.3
            self._initialize_model()
            
        except Exception as e:
            logger.error(f"🚨 ERRO CRÍTICO ao configurar o Gemini: {e}")
            raise

    def _initialize_model(self):
        """Inicializa o cliente Gemini com a chave atual usando o novo SDK."""
        try:
            current_key = self.api_keys[self.current_key_index]
            self.client = genai.Client(api_key=current_key)
            logger.info(f"✅ Cliente Gemini (New SDK) inicializado (chave índice {self.current_key_index}).")
        except Exception as e:
            logger.error(f"🚨 ERRO CRÍTICO ao configurar o Gemini com a chave índice {self.current_key_index}: {e}", exc_info=True)
            raise

    def _rotate_key(self):
        """Muda para a próxima chave na lista."""
        self.current_key_index = (self.current_key_index + 1) % len(self.api_keys)
        logger.warning(f"Alternando para a chave de API do Google com índice {self.current_key_index}.")
        self._initialize_model()
        return self.current_key_index

    def _save_prompt_to_log(self, prompt: Any, system_instruction: Optional[str] = None):
        """Adiciona o prompt enviado a um arquivo de log na raiz do backend."""
        try:
            # requirements.txt está em backend/requirements.txt
            # gemini_service.py está em backend/app/services/gemini_service.py
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            file_path = os.path.join(base_dir, "prompt_log.txt")
            
            with open(file_path, "a", encoding="utf-8") as f:
                f.write(f"\n\n{'='*20} LOG ENTRY: {datetime.now(timezone.utc).isoformat()} {'='*20}\n\n")
                if system_instruction:
                    f.write("=== SYSTEM INSTRUCTION ===\n")
                    f.write(str(system_instruction))
                    f.write("\n\n")
                
                f.write("=== PROMPT CONTENTS ===\n")
                if isinstance(prompt, list):
                    for part in prompt:
                        if isinstance(part, str):
                            f.write(part)
                        elif hasattr(part, 'text') and part.text:
                            f.write(part.text)
                        elif isinstance(part, types.Part) and part.inline_data:
                            f.write(f"[Part Mídia: {part.inline_data.mime_type or 'unknown'}]")
                        else:
                            f.write(f"[{type(part).__name__} object]")
                        f.write("\n")
                else:
                    f.write(str(prompt))
            logger.info(f"Prompt adicionado ao log em {file_path}")
        except Exception as e:
            logger.error(f"Erro ao salvar prompt no log: {e}")

    def _save_response_to_log(self, response_text: str):
        """Adiciona a resposta gerada ao arquivo de log."""
        try:
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            file_path = os.path.join(base_dir, "prompt_log.txt")
            
            with open(file_path, "a", encoding="utf-8") as f:
                f.write("\n=== GEMINI RESPONSE ===\n")
                f.write(str(response_text))
                f.write("\n")
        except Exception as e:
            logger.error(f"Erro ao salvar resposta no log: {e}")

    def _parse_json_response(self, response_text: str) -> dict:
        """Limpa e parseia JSON da resposta da IA, com tratamento de erros de escape."""
        clean_response = response_text.strip().replace("```json", "").replace("```", "")
        
        try:
            return json.loads(clean_response)
        except json.JSONDecodeError:
            # Tenta corrigir backslashes soltos (comum em caminhos de arquivo ou LaTeX)
            try:
                fixed_response = re.sub(r'\\(?![/\"\\bfnrtu])', r'\\\\', clean_response)
                return json.loads(fixed_response)
            except json.JSONDecodeError:
                raise

    async def _generate_with_retry_async(
        self, 
        prompt: Any, 
        db: AsyncSession, 
        user: models.User, 
        force_json: bool = True,
        model_name: str = 'gemini-2.5-flash',
        system_instruction: Optional[str] = None
    ):
        """
        Executa a chamada assíncrona para a API Gemini, com rotação de chaves e débito de token no sucesso.
        """
        
        # Configuração do novo SDK
        config_args = {
            "temperature": self.generation_config.get("temperature", 0.2),
            "top_p": self.generation_config.get("top_p", 1),
            "top_k": self.generation_config.get("top_k", 1),
        }

        # Penalties não são suportados no gemini-2.5-flash e variantes lite
        if "gemini-2.5-flash" not in model_name:
            config_args["frequency_penalty"] = self.generation_config.get("frequency_penalty", 0.0)
            config_args["presence_penalty"] = self.generation_config.get("presence_penalty", 0.0)

        if force_json:
            config_args["response_mime_type"] = "application/json"
        
        if system_instruction:
            config_args["system_instruction"] = system_instruction

        # Exporta o prompt para debug antes de enviar
        self._save_prompt_to_log(prompt, system_instruction)

        gen_config = types.GenerateContentConfig(**config_args)
        
        initial_key_index = self.current_key_index
        max_attempts_per_key = 2

        while True:
            for attempt in range(max_attempts_per_key):
                try:
                    response = await self.client.aio.models.generate_content(
                        model=model_name,
                        contents=prompt,
                        config=gen_config
                    )
                    
                    # --- LÓGICA DE TOKEN (ODÔMETRO) ---
                    usage_metadata = response.usage_metadata
                    tokens_to_deduct = 0

                    if usage_metadata:
                        input_tokens = usage_metadata.prompt_token_count
                        output_tokens = usage_metadata.candidates_token_count
                        
                        # Calcula o custo equivalente em "tokens de input"
                        equivalent_total_tokens = input_tokens + (output_tokens * self.output_token_multiplier)
                        tokens_to_deduct = round(equivalent_total_tokens)
                        
                        logger.info(
                            f"Uso de tokens (User {user.id}): "
                            f"Input={input_tokens}, Output={output_tokens}. "
                            f"Custo Equivalente (x{self.output_token_multiplier:.2f}) = {tokens_to_deduct} tokens."
                        )

                    if tokens_to_deduct > 0:
                        # Usa 'amount' conforme padrão do ProspectAI
                        await crud_user.decrement_user_tokens(db, db_user=user, amount=tokens_to_deduct)

                    try:
                        self._save_response_to_log(response.text)
                    except Exception:
                        pass

                    return response, tokens_to_deduct

                except Exception as e:
                    error_str = str(e).lower()
                    # Detecção de Erro de Cota (429), Recurso Esgotado ou Chave Suspensa/Permissão (403)
                    if "429" in error_str or "resource exhausted" in error_str or "quota" in error_str or "403" in error_str or "permission denied" in error_str or "suspended" in error_str:
                        logger.warning(f"Erro de API (Quota/Permissão) com a chave {self.current_key_index}. Rotacionando... Erro: {e}")
                        break # Sai do loop 'for' para rotacionar a chave
                    
                    elif "blocked" in error_str or "invalid argument" in error_str:
                        logger.error(f"Erro não recuperável (Bloqueio/Inválido): {e}")
                        raise e
                    else:
                        logger.error(f"Erro inesperado na API Gemini: {e}. Tentativa {attempt + 1}.")
                        await asyncio.sleep(1)

            # Se saiu do loop 'for', significa que precisa trocar de chave
            new_key_index = self._rotate_key()
            if new_key_index == initial_key_index:
                logger.critical(f"Todas as {len(self.api_keys)} chaves de API falharam.")
                raise Exception("Todas as chaves de API excederam a quota.")

    async def generate_embedding(self, text: str) -> List[float]:
        """
        Gera embedding usando o modelo gemini-embedding-001.
        Força 768 dimensões para compatibilidade e eficiência.
        """
        try:
            # Configuração para reduzir de 3072 para 768 dimensões (Matryoshka)
            # Isso economiza 4x de espaço no banco e mantém a performance.
            embed_config = types.EmbedContentConfig(
                output_dimensionality=768
            )

            response = await self.client.aio.models.embed_content(
                model="gemini-embedding-001",
                contents=text,
                config=embed_config
            )
            if response.embeddings:
                return response.embeddings[0].values
            return []
        except Exception as e:
            logger.error(f"Erro ao gerar embedding: {e}")
            return []

    async def generate_embeddings_batch(self, texts: List[str], batch_size: int = 100) -> List[List[float]]:
        """
        Gera embeddings em lote usando gemini-embedding-001 com 768 dimensões.
        """
        all_embeddings = []
        
        # Configuração para 768 dimensões
        embed_config = types.EmbedContentConfig(
            output_dimensionality=768
        )

        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            try:
                response = await self.client.aio.models.embed_content(
                    model="gemini-embedding-001",
                    contents=batch,
                    config=embed_config
                )
                if response.embeddings:
                    batch_embeddings = [e.values for e in response.embeddings]
                    all_embeddings.extend(batch_embeddings)
                else:
                    logger.warning(f"Batch {i} retornou sem embeddings.")
                    all_embeddings.extend([[] for _ in batch])
            except Exception as e:
                logger.error(f"Erro ao gerar embeddings em lote (índice {i}): {e}")
                all_embeddings.extend([[] for _ in batch])
        return all_embeddings

    async def _retrieve_rag_context(self, db: AsyncSession, config_id: int, query_text: str) -> str:
        """Busca contexto relevante na base vetorial (PGVector)."""
        if not query_text: return ""
        
        query_embedding = await self.generate_embedding(query_text)
        if not query_embedding:
            logger.warning(f"RAG: Falha ao gerar embedding para a query: '{query_text[:50]}...'")
            return ""

        # Busca as origens únicas (abas/drive) para garantir a recuperação por categoria
        origins_stmt = select(models.KnowledgeVector.origin).where(
            models.KnowledgeVector.config_id == config_id
        ).distinct()
        origins_result = await db.execute(origins_stmt)
        origins = origins_result.scalars().all()
        
        if not origins:
            return ""

        all_formatted_sections = []
        
        for origin in origins:
            # Recupera os 10 itens mais relevantes para cada aba/origem
            stmt = select(models.KnowledgeVector).where(
                models.KnowledgeVector.config_id == config_id,
                models.KnowledgeVector.origin == origin
            ).order_by(
                models.KnowledgeVector.embedding.cosine_distance(query_embedding)
            ).limit(10)
            
            res = await db.execute(stmt)
            vectors = res.scalars().all()
            
            if not vectors:
                continue
                
            # Agrupa as linhas sob um único cabeçalho para formar a tabela
            header = ""
            rows = []
            for v in vectors:
                # O conteúdo está no formato: "# Nome\nHeader|Header\nValue|Value"
                lines = v.content.split('\n')
                if len(lines) >= 3:
                    header = lines[1]
                    rows.append(lines[2])
            
            if header:
                # Formata a seção conforme o exemplo solicitado
                section_name = origin.upper() if origin.lower() == "drive" else origin
                section_text = f"# {section_name}\n{header}\n" + "\n".join(rows)
                all_formatted_sections.append(section_text)

        if not all_formatted_sections:
            return ""

        context = "\n\n".join(all_formatted_sections)
        logger.info(f"RAG: Contexto recuperado e formatado em tabelas por seção.")
        return context

    def _format_history_for_prompt(self, db_history: List[dict]) -> str:
        """Formata o histórico de conversa em uma string simples e legível."""
        
        # --- LÓGICA DE RESET ---
        # Filtra o histórico para enviar ao prompt apenas o que ocorreu APÓS o último '/reset'
        start_index = 0
        for i, msg in enumerate(db_history):
            content = str(msg.get("content", "")).strip()
            if "/reset" in content:
                start_index = i + 1
        
        filtered_history = db_history[start_index:]
        
        history_lines = []
        for msg in filtered_history:
            # Define o remetente como 'ia' ou 'contato'
            role = "IA" if msg.get("role") == "assistant" else "Contato"
            content = str(msg.get("content", "")).strip()
            
            # Adiciona a linha apenas se houver conteúdo
            if content:
                history_lines.append(f"{role}: {content}")
        
        # Se não houver histórico, retorna uma mensagem padrão
        if not history_lines:
            return "Nenhuma mensagem no histórico."
            
        return "\n".join(history_lines)

    def _get_time_context(self) -> str:
        """Retorna uma string formatada com a data, hora e dia da semana atual (Brasília)."""
        now_utc = datetime.now(timezone.utc)
        # Ajuste para o fuso horário de Brasília (UTC-3) para as personas brasileiras
        now_br = now_utc.astimezone(timezone(timedelta(hours=-3)))
        dias_semana = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"]
        return (
            f"# CONTEXTO TEMPORAL\n"
            f"Data e Hora Atual: {now_br.strftime('%d/%m/%Y %H:%M:%S')}\n"
            f"Dia da Semana: {dias_semana[now_br.weekday()]}\n"
        )

    # --- ASSINATURA ATUALIZADA PARA PASSAR DB E USER ---
    async def transcribe_and_analyze_media(
        self, 
        media_data: dict, 
        config: models.Config,
        db: AsyncSession,
        user: models.User,
        db_history: Optional[List[dict]] = None
    ) -> str:
        logger.info(f"Iniciando transcrição/análise para mídia do tipo {media_data.get('mime_type')}")
        prompt_contents = []

        # --- CORREÇÃO INÍCIO: Conversão de mídia para binário ---
        raw_data = media_data.get("data")
        mime_type = media_data.get("mime_type")

        # Garante que os dados de mídia sejam binários (bytes) para a API do Gemini.
        # Se recebermos uma string, assumimos que é base64 e a decodificamos.
        if isinstance(raw_data, str):
            try:
                # Remove o cabeçalho de Data URL se presente
                if "base64," in raw_data:
                    raw_data = raw_data.split("base64,")[1]
                
                # Decodifica a string base64 para bytes
                raw_data = base64.b64decode(raw_data)
            except (IndexError, base64.binascii.Error) as e:
                logger.error(f"Falha ao decodificar mídia em base64: {e}")
                return f"[Erro: Formato de mídia inválido ({e})]", 0

        # A API do Gemini espera que o campo 'data' seja bytes.
        if not isinstance(raw_data, bytes):
            logger.error(f"Os dados da mídia não são binários e não puderam ser convertidos. Tipo: {type(raw_data)}")
            return "[Erro: Dados de mídia em formato inesperado]", 0

        # --- NOVO SDK: Criação do objeto Part ---
        try:
            media_part = types.Part.from_bytes(data=raw_data, mime_type=mime_type)
        except Exception as e:
            logger.error(f"Erro ao criar Part de mídia: {e}")
            return "[Erro interno ao processar arquivo]", 0

        # Define system instruction se disponível (para imagens)
        system_instruction = None
        if config.prompt:
            system_instruction = config.prompt

        if 'audio' in media_data['mime_type']:
            # --- CORREÇÃO: Simplificação do prompt de transcrição ---
            # O modelo é mais eficaz para transcrição quando o prompt é direto.
            # Pedir JSON para uma tarefa simples como essa pode confundir o modelo.
            transcription_prompt = (
                f"# TAREFA ATUAL: Transcrição de Áudio\n\n"
                f"# REGRAS DE EXECUÇÃO\n"
                f"1. Transcreva o áudio de forma literal e precisa.\n"
                f"2. Não adicione comentários, interpretações ou formatações extras.\n"
                f"3. Retorne APENAS o texto transcrito.\n\n"
                f"# FORMATO DE RESPOSTA\n"
                f"Texto puro da transcrição."
            )
            prompt_contents = [transcription_prompt, media_part]
            
            max_retries = 3
            last_error = "Nenhum erro registrado."

            for attempt in range(max_retries):
                try:
                    # force_json=False, pois não esperamos mais um JSON como resposta.
                    response, tokens_used = await self._generate_with_retry_async(prompt_contents, db, user, force_json=False)
                    
                    transcription = response.text.strip()
                    if not transcription:
                        reason = response.candidates[0].finish_reason.name if response.candidates else "UNKNOWN"
                        logger.warning(f"Tentativa {attempt + 1}/{max_retries}: Transcrição vazia. Razão: {reason}. Tentando novamente...")
                        last_error = f"Resposta vazia da IA (Razão: {reason})"
                        await asyncio.sleep(1)
                        continue

                    logger.info(f"Transcrição de áudio gerada: '{transcription[:100]}...'")
                    return transcription, tokens_used

                except Exception as e:
                    logger.error(f"Tentativa {attempt + 1}/{max_retries}: Erro ao transcrever áudio: {e}", exc_info=True)
                    last_error = str(e)
                    await asyncio.sleep(1)

            logger.error(f"Falha ao transcrever áudio após {max_retries} tentativas. Último erro: {last_error}")
            return f"[Erro ao processar áudio após {max_retries} tentativas]", 0

        else:
            # --- ANÁLISE DE IMAGEM/PDF ---
            if db_history is None:
                db_history = []

            # RAG para análise de imagem (se houver texto na imagem que precise de contexto)
            last_user_msg = next((m.get('content', '') for m in reversed(db_history) if m.get('role') == 'user'), "")
            rag_context = await self._retrieve_rag_context(db, config.id, last_user_msg)

            # A função agora retorna uma string formatada, não mais um JSON.
            historico_conversa_str = self._format_history_for_prompt(db_history or [])
            
            time_context = self._get_time_context()

            analysis_prompt_text = (
                f"# CONTEXTO (RAG)\n{rag_context}\n\n"
                f"{time_context}\n"
                f"# HISTÓRICO DA CONVERSA\n{historico_conversa_str}\n\n"
                f"# TAREFA ATUAL: Extração de Dados de Mídia\n"
                f"Analise o arquivo enviado (imagem ou documento) e extraia as informações relevantes para a prospecção.\n\n"
                f"# REGRAS DE EXECUÇÃO\n"
                f"1. **Foco na Extração:** Identifique dados importantes (produtos, dúvidas, intenções) citados no arquivo.\n"
                f"2. **Tom Neutro:** Atue como um extrator de dados, não use a persona do assistente.\n"
                f"3. **Contexto:** Use o histórico e o RAG para entender o que é prioritário extrair.\n\n"
                f"# FORMATO DE RESPOSTA (JSON OBRIGATÓRIO)\n"
                f"Retorne APENAS um JSON válido.\n"
                f"{{\n"
                f'  "analise": "Texto da extração/análise aqui"\n'
                f"}}"
            )
            
            prompt_contents = [analysis_prompt_text, media_part]

            try:
                response, tokens_used = await self._generate_with_retry_async(prompt_contents, db, user, force_json=True, system_instruction=system_instruction)
                response_json = self._parse_json_response(response.text)
                analysis = response_json.get("analise", "[Não foi possível extrair a análise]").strip()
                logger.info(f"Análise de mídia gerada: '{analysis[:100]}...'")
                return analysis, tokens_used
            except Exception as e:
                logger.error(f"Erro ao analisar mídia com prompt JSON: {e}")
                return f"[Erro ao processar mídia: {media_data.get('mime_type')}]", 0

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

        task_map = {
            'initial': "Gerar a primeira mensagem de prospecção para iniciar a conversa. Seja breve e direto.",
            'reply': "Analisar a última mensagem do contato e formular a PRÓXIMA resposta para avançar na conversa, usando o contexto disponível.",
            'followup': "Analisar as mensagens e decidir entre continuar o fluxo, fazer um follow-up ou se não é necessário mais nada apenas retorne 'null' no campo 'mensagem_para_enviar"
        }
        # A função agora retorna uma string formatada, não mais um JSON.
        formatted_history = self._format_history_for_prompt(conversation_history_db)
        
        # --- RAG QUERY BUILDER ---
        rag_query = ""
        if conversation_history_db:
            recent_msgs = conversation_history_db[-3:]
            rag_query = " | ".join([m.get('content', '') for m in recent_msgs])
        elif mode == 'initial':
            rag_query = "Abordagem inicial prospecção"

        rag_context = await self._retrieve_rag_context(db, config.id, rag_query)
        
        # System Instruction (Prompt Fixo)
        system_instruction = config.prompt or "Você é um assistente de prospecção."
        
        # --- TIME CONTEXT ---
        time_context = self._get_time_context()

        # --- CALENDAR CONTEXT ---
        calendar_context = ""
        if config.is_calendar_active and config.google_calendar_credentials and config.available_hours:
            # Busca eventos ocupados para os próximos 7 dias
            busy_slots_text = "Nenhum compromisso agendado nos próximos dias."
            try:
                calendar_service = get_google_calendar_service(config)
                events = await calendar_service.get_upcoming_events(days=7)
                if events:
                    busy_slots_text = "Compromissos já agendados (HORÁRIOS OCUPADOS):\n"
                    for ev in events:
                        busy_slots_text += f"- {ev['summary']}: {ev['start']} até {ev['end']}\n"
            except Exception as e:
                logger.error(f"Erro ao buscar agenda para prompt: {e}")
                busy_slots_text = "Erro ao carregar compromissos existentes."

            calendar_context = (
                f"\n# DISPONIBILIDADE DE AGENDA\n"
                f"Seu padrão de horários disponíveis: {json.dumps(config.available_hours, ensure_ascii=False)}.\n"
                f"{busy_slots_text}\n"
                f"REGRAS DE AGENDAMENTO:\n"
                f"1. Verifique se o horário proposto pelo cliente não conflita com os compromissos listados acima.\n"
                f"2. Proponha apenas horários dentro do seu padrão de disponibilidade.\n"
                f"3. Se o cliente confirmar, solicite o e-mail. Com horário E e-mail, use a ação 'agendar_reuniao'.\n"
            )

        # Montagem do Prompt Texto (Estilo AtendAI)
        prompt_text = (
            f"# CONTEXTO (RAG)\n{rag_context}\n\n"
            f"# HISTÓRICO\n{formatted_history}\n\n"
            f"# DADOS DO CONTATO\n"
            f"Nome: {contact.nome}\n"
            f"Observações: {contact.observacoes}\n"
            f"{time_context}"
            f"{calendar_context}\n"
            f"# DIRETRIZES DE HUMANIZAÇÃO (CRÍTICO)\n"
            f"- **Zero 'Corporatiquês':** PROIBIDO começar frases com 'Ótimo', 'Excelente', 'Perfeito', 'Entendido', 'Compreendo'. Isso denuncia que você é um robô. Vá direto ao ponto.\n"
            f"- **NÃO SE REPITA (REGRA CRÍTICA):** Analise o histórico. É PROIBIDO repetir informações, perguntas, ações ou parafrasear o que o usuário disse. Se você já deu uma informação, não a dê novamente.\n"
            f"- **Continuidade Real:** Trate o histórico como uma conversa contínua de WhatsApp. Se já houver mensagens anteriores, JAMAIS use 'Olá' ou apresentações novamente.\n"
            f"- **Zero Saudações Repetidas:** Se já houve um cumprimento no histórico recente, NÃO inicie a resposta com 'Olá', 'Oi', 'Bom dia', etc. Continue a conversa diretamente.\n"
            f"- **Conexão Lógica:** Use conectivos de conversa real ('Então...', 'Nesse caso...', 'Ah, sobre isso...'). Evite listas com bullets se puder responder em uma frase corrida.\n"
            f"- **Espelhamento de Tom:** Se a mensagem do cliente for curta (ex: 'qual o preço?'), seja direto ('Custa R$ 50,00'). Se ele for detalhista, explique mais.\n"
            f"- **Formatação de Chat:** Evite listas com marcadores (bullets) ou negrito excessivo a menos que seja estritamente necessário. No WhatsApp, pessoas usam parágrafos curtos.\n"
            f"- **Banalidade Controlada:** Em vez de 'Sinto muito pelo inconveniente causado', use algo mais leve como 'Poxa, entendo o problema' ou 'Que chato isso, vamos resolver'.\n"
            f"- **Proibido Repetir Nomes:** Use o nome do cliente APENAS na primeira saudação do dia. Nas mensagens seguintes, JAMAIS comece com 'Ah, {contact.nome}', 'Olá {contact.nome}' ou similares. Fale direto.\n"
            f"- **Zero Interjeições Artificiais:** Não comece frases com 'Ah, entendo!', 'Compreendo perfeitamente', 'Excelente pergunta'. Isso soa falso.\n"
            f"- **Parágrafos Únicos:** Tente responder tudo em UM ou TRES parágrafos no máximo.\n\n"
            f"# CRITÉRIOS DE PONTUAÇÃO (LEAD SCORE)\n"
            f"- **0-2 (Frio):** Desinteressado, hostil, resposta monossilábica, pede para parar ou ignora perguntas.\n"
            f"- **3-5 (Morno):** Responde educadamente, mas com pouco engajamento. Faz perguntas genéricas sem demonstrar intenção real de avanço.\n"
            f"- **6-8 (Interessado):** Engajado na conversa, responde a perguntas de qualificação, solicita informações específicas (preços, fotos, prazos) e mantém o diálogo fluido.\n"
            f"- **9-10 (Quente):** Demonstra urgência, solicita visita técnica, reunião ou orçamento formal. Aceita prontamente os próximos passos propostos.\n\n"
            f"# CRITÉRIOS PARA SITUAÇÃO 'Lead Qualificado'\n"
            f"Mude a `nova_situacao` para 'Lead Qualificado' APENAS se:\n"
            f"1. O contato demonstrou interesse real e ativo (Score >= 7).\n"
            f"2. Houve uma troca de mensagens significativa (não apenas uma resposta isolada).\n"
            f"3. O contato concordou com um próximo passo claro (visita, reunião, envio de projeto).\n"
            f"Se o interesse for vago ou inicial, mantenha como 'Aguardando Resposta'.\n"
            f"Se a pessoa demonstrar desinterece, hostilidade, mude para 'Não Interessado'.\n\n"
            f"# TAREFA ATUAL: {task_map.get(mode, 'Responder')}\n\n"
            f"# REGRAS DE EXECUÇÃO\n"
            f"1. **Fonte de Verdade:** Use prioritariamente o CONTEXTO (RAG) e (System).\n"
            f"2. **Envio de Arquivos do Drive (IMPORTANTE):**\n"
            f"   - Identifique arquivos no CONTEXTO (RAG) que começam com `[DRIVE]`. O ID está no formato `| ID: <ID_DO_ARQUIVO> |`.\n"
            f"   - Se o usuário pedir fotos/vídeos, escolha os IDs mais relevantes para o assunto e coloque-os na lista `arquivos_anexos`.\n"
            f"   - **NÃO** coloque links, IDs ou placeholders (ex: `[Link]`) no texto da mensagem (`mensagem_para_enviar`). Apenas mencione que está enviando as fotos.\n"
            f"3. **Proibido Links Falsos:** JAMAIS invente links. Se não houver arquivo no RAG, diga que não tem a foto no momento.\n"
            f"4. **Objetivo:** Avançar a prospecção. Seja rigoroso na qualificação: só marque como 'Lead Qualificado' se houver engajamento real e dados concretos fornecidos.\n"
            f"5. **Transbordo (Atendente Chamado):** Se o cliente solicitar explicitamente falar com um humano, especialista, ou se você encontrar grande dificuldade em responder uma dúvida técnica mesmo consultando o CONTEXTO (RAG) e INSTRUÇÕES, mude a `nova_situacao` para 'Atendente Chamado'.\n"
            f"6. **Agendamento:** Se o cliente confirmar um horário, PEÇA O E-MAIL para o convite. Com horário E e-mail, retorne 'agendar_reuniao' em `acao_agenda`, a data/hora ISO em `data_agendamento` e o e-mail em `email_cliente`.\n"
            f"# FORMATO DE RESPOSTA (JSON OBRIGATÓRIO)\n"
            f"Retorne APENAS um JSON válido, sem blocos de código.\n"
            f"{{\n"
            f'  "mensagem_para_enviar": "Texto da resposta (ou null)",\n'
            f'  "nova_situacao": "Aguardando Resposta" | "Lead Qualificado" | "Não Interessado" | "Atendente Chamado",\n'
            f'  "lead_score": 0 a 10 (Inteiro indicando o nível de interesse),\n'
            f'  "observacoes": "Resumo curto da conversa",\n'
            f'  "arquivos_anexos": ["ID_DO_ARQUIVO_1"],\n'
            f'  "novos_contatos": [{{"nome": "Nome", "numero": "Telefone", "observacao": "Contexto"}}],\n'
            f'  "acao_agenda": "agendar_reuniao" | null,\n'
            f'  "data_agendamento": "YYYY-MM-DDTHH:MM:SS" | null,\n'
            f'  "email_cliente": "email@cliente.com" | null\n'
            f"}}"
        )

        max_retries = 3
        last_error = None

        for attempt in range(max_retries):
            try:
                response, tokens_used = await self._generate_with_retry_async(
                    prompt_text, 
                    db, 
                    user, 
                    force_json=True, 
                    system_instruction=system_instruction
                )
                response_data = self._parse_json_response(response.text)

                # A validação de mensagem vazia foi removida, pois a IA pode intencionalmente
                # decidir não enviar uma mensagem. O agent_worker está preparado para lidar com essa situação.
                response_data['token_usage'] = tokens_used
                return response_data  # Retorna a resposta válida

            except (json.JSONDecodeError, KeyError) as e:
                logger.warning(f"Tentativa {attempt + 1}/{max_retries}: Erro de formato na resposta da IA ({e}). Tentando novamente...")
                last_error = f"Erro de formato JSON: {e}"
                await asyncio.sleep(1)
                continue
            except Exception as e:
                logger.error(f"Erro na tentativa {attempt + 1}/{max_retries} ao gerar ação (Modo: {mode}): {e}", exc_info=True)
                last_error = str(e)
                break # Sai do loop em caso de erro crítico (ex: quota)

        # Se todas as tentativas falharem
        logger.error(f"Falha ao gerar ação de conversação para o modo '{mode}' após {max_retries} tentativas.")
        return {
            "mensagem_para_enviar": None,
            "nova_situacao": "Erro IA",
            "observacoes": f"Falha da IA após {max_retries} tentativas: {last_error}",
            "token_usage": 0
        }

    async def analyze_prospecting_data(
        self,
        db: AsyncSession,
        user: models.User,
        question: str,
        start_date: Optional[datetime],
        end_date: Optional[datetime],
        prospect_ids: Optional[List[int]] = None
    ) -> Dict[str, Any]:
        """Usa a IA para analisar dados de prospecção com base em uma pergunta do usuário."""
        from app.crud import crud_prospect, crud_config

        logger.info(f"Iniciando análise de dados de prospecção para user_id={user.id} com a pergunta: '{question[:100]}...'")

        # Coletar dados relevantes
        prospects = await crud_prospect.get_prospects_by_user(db, user_id=user.id)
        simplified_prospects = []
        for p in prospects:
            if prospect_ids and p.id not in prospect_ids:
                continue

            p_date = p.created_at.replace(tzinfo=timezone.utc)
            if start_date and p_date < start_date:
                continue
            if end_date and p_date > end_date:
                continue

            contacts_summary = {
                "total": len(p.contacts),
                "concluido": sum(1 for c in p.contacts if c.situacao == 'Concluído'),
                "lead_qualificado": sum(1 for c in p.contacts if c.situacao == 'Lead Qualificado'),
                "aguardando_resposta": sum(1 for c in p.contacts if c.situacao == 'Aguardando Resposta'),
            }
            simplified_prospects.append({
                "id": p.id, "nome": p.nome_prospeccao, "status": p.status,
                "created_at": p.created_at.isoformat(), "contacts_summary": contacts_summary
            })

        analysis_prompt = {
            "objetivo": "Você é um analista de vendas sênior. Analise os dados de prospecção fornecidos para responder à pergunta do usuário. Sua resposta DEVE ser um objeto JSON.",
            "pergunta_usuario": question,
            "dados_contexto": {
                "resumo_usuario": {"id": user.id, "email": user.email},
                "prospeccoes_no_periodo": simplified_prospects,
                "contexto_temporal": self._get_time_context().strip()
            },
            "formato_resposta_obrigatorio": {
                "descricao": "Sua resposta DEVE ser um único objeto JSON válido. Siga a estrutura sugerida.",
                "estrutura_sugerida": {
                    "diagnostico_geral": "Um parágrafo resumindo a situação.",
                    "principais_pontos_de_friccao": [
                        {"area": "Nome da Área (ex: Abertura da conversa)", "observacoes": "Detalhes observados.", "impacto_na_conversao": "Alto/Médio/Baixo"}
                    ],
                    "insights_acionaveis": [
                        {"titulo": "Título da Sugestão", "sugestoes": ["Sugestão 1.", "Sugestão 2."]}
                    ],
                    "proximos_passos_recomendados": "Recomendação final."
                }
            }
        }
        
        response, _ = await self._generate_with_retry_async(json.dumps(analysis_prompt, ensure_ascii=False, cls=SetEncoder), db, user, force_json=True)
        return self._parse_json_response(response.text)

_gemini_service_instance = None
def get_gemini_service():
    global _gemini_service_instance
    if _gemini_service_instance is None:
        _gemini_service_instance = GeminiService()
    return _gemini_service_instance