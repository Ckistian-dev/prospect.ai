from google import genai
from google.genai import types
from collections.abc import Set
import logging
import json
from datetime import datetime, timezone
import base64
from typing import Optional, List, Dict, Any
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db import models
from app.crud import crud_user # Import necessário para a função de débito

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
            self.generation_config = {"temperature": 0.5, "top_p": 1, "top_k": 1}
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

    # --- MÉTODO ATUALIZADO PARA RECEBER DB E USER E DEBITAR O TOKEN ---
    async def _generate_with_retry_async(
        self, 
        prompt: Any, 
        db: AsyncSession, 
        user: models.User, 
        force_json: bool = True,
        model_name: str = 'gemini-2.5-flash'
    ):
        """
        Executa a chamada assíncrona para a API Gemini, com rotação de chaves e débito de token no sucesso.
        """
        
        # Configuração do novo SDK
        config_args = {
            "temperature": self.generation_config.get("temperature", 0.5),
            "top_p": self.generation_config.get("top_p", 1),
            "top_k": self.generation_config.get("top_k", 1),
        }
        if force_json:
            config_args["response_mime_type"] = "application/json"

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
                    
                    # --- LÓGICA DE DÉBITO CENTRALIZADA ---
                    await crud_user.decrement_user_tokens(db, db_user=user, amount=1)
                    return response

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
                return f"[Erro: Formato de mídia inválido ({e})]"

        # A API do Gemini espera que o campo 'data' seja bytes.
        if not isinstance(raw_data, bytes):
            logger.error(f"Os dados da mídia não são binários e não puderam ser convertidos. Tipo: {type(raw_data)}")
            return "[Erro: Dados de mídia em formato inesperado]"

        # --- NOVO SDK: Criação do objeto Part ---
        try:
            media_part = types.Part.from_bytes(data=raw_data, mime_type=mime_type)
        except Exception as e:
            logger.error(f"Erro ao criar Part de mídia: {e}")
            return "[Erro interno ao processar arquivo]"

        if 'audio' in media_data['mime_type']:
            # --- CORREÇÃO: Simplificação do prompt de transcrição ---
            # O modelo é mais eficaz para transcrição quando o prompt é direto.
            # Pedir JSON para uma tarefa simples como essa pode confundir o modelo.
            transcription_prompt = "Transcreva este áudio de forma literal. Retorne apenas o texto transcrito, sem nenhuma palavra ou formatação adicional."
            prompt_contents = [transcription_prompt, media_part]
            
            max_retries = 3
            last_error = "Nenhum erro registrado."

            for attempt in range(max_retries):
                try:
                    # force_json=False, pois não esperamos mais um JSON como resposta.
                    response = await self._generate_with_retry_async(prompt_contents, db, user, force_json=False)
                    
                    transcription = response.text.strip()
                    if not transcription:
                        reason = response.candidates[0].finish_reason.name if response.candidates else "UNKNOWN"
                        logger.warning(f"Tentativa {attempt + 1}/{max_retries}: Transcrição vazia. Razão: {reason}. Tentando novamente...")
                        last_error = f"Resposta vazia da IA (Razão: {reason})"
                        await asyncio.sleep(1)
                        continue

                    logger.info(f"Transcrição de áudio gerada: '{transcription[:100]}...'")
                    return transcription

                except Exception as e:
                    logger.error(f"Tentativa {attempt + 1}/{max_retries}: Erro ao transcrever áudio: {e}", exc_info=True)
                    last_error = str(e)
                    await asyncio.sleep(1)

            logger.error(f"Falha ao transcrever áudio após {max_retries} tentativas. Último erro: {last_error}")
            return f"[Erro ao processar áudio após {max_retries} tentativas]"

        else:
            # --- ANÁLISE DE IMAGEM/PDF ---
            if db_history is None:
                db_history = []

            formatted_history = self._format_history_for_prompt(db_history or [])
            
            contexto_planilha_str = json.dumps(config.contexto_sheets or {"aviso": "Nenhum contexto de planilha foi fornecido."}, ensure_ascii=False, indent=2, cls=SetEncoder)
            historico_conversa_str = json.dumps(formatted_history, ensure_ascii=False, indent=2, cls=SetEncoder)

            analysis_prompt_text = f"""
                **Instrução Geral:**
                Você é um especialista em extração de dados de documentos e imagens. Sua tarefa é analisar o arquivo enviado (imagem ou documento) e extrair as informações relevantes. O resultado será usado como contexto para outra IA e não deve ter o tom da persona.

                **Regras:**
                1.  **Foco na Extração de Dados:** Sua prioridade é EXTRAIR os dados importantes do arquivo. Use o histórico da conversa e o contexto da planilha para entender o que é relevante.
                2.  **Seja um Extrator, Não um Assistente:** Sua resposta deve ser puramente a informação extraída. Não converse, não cumprimente, não use a persona do assistente.
                3.  **Resposta Limpa:** Sua resposta final deve ser APENAS o objeto JSON, sem nenhuma outra palavra, título ou formatação como ```json.

                **Formato de Resposta Obrigatório (JSON):**
                Sua resposta DEVE ser um único objeto JSON válido com a seguinte chave:
                {{
                "analise": "O texto puro da análise/extração do arquivo, seguindo as regras acima."
                }}

                **Contexto para Análise:**
                - **Contexto da Planilha:** {contexto_planilha_str}
                - **Histórico da Conversa:** {historico_conversa_str}

                **Tarefa Imediata:**
                Analise o arquivo a seguir e retorne a extração de dados no formato JSON especificado.
                """
            
            prompt_contents = [analysis_prompt_text, media_part]

            try:
                response = await self._generate_with_retry_async(prompt_contents, db, user, force_json=True)
                response_json = json.loads(response.text)
                analysis = response_json.get("analise", "[Não foi possível extrair a análise]").strip()
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
        # Substitui a lógica de prompt_config pela nova lógica de contexto
        # A função _replace_variables_in_dict ainda pode ser útil no contexto_sheets se você usar variáveis lá
        contexto_sheets_processado = self._replace_variables_in_dict(config.contexto_sheets or {}, contact)
        arquivos_drive_processado = config.arquivos_drive or {}

        task_map = {
            'initial': "Gerar a primeira mensagem de prospecção para iniciar a conversa. Seja breve e direto.",
            'reply': "Analisar a última mensagem do contato e formular a PRÓXIMA resposta para avançar na conversa, usando o contexto disponível.",
            'followup': "Analisar as mensagens e decidir entre continuar o fluxo, fazer um follow-up ou se não é necessário mais nada apenas retorne 'null' no campo 'mensagem_para_enviar"
        }
        formatted_history = self._format_history_for_prompt(conversation_history_db)
        master_prompt = {
            "instrucao_geral": "Você é um assistente de prospecção e vendas...",
            "formato_resposta_obrigatorio": {
                "descricao": "Sua resposta DEVE ser um único objeto JSON válido...",
                "chaves": {
                    "mensagem_para_enviar": "O texto da mensagem a ser enviada. Para criar parágrafos, use o caractere de quebra de linha (\\n). Se não for enviar mensagem, retorne null.",
                    "nova_situacao": "Um dos seguintes: 'Aguardando Resposta', 'Lead Qualificado', 'Não Interessado', 'Concluído'.",
                    "observacoes": "Um resumo geral da conversa até o momento.",
                    "arquivos_anexos": "Lista de IDs dos arquivos a serem enviados (opcional). Ex: ['12345']"
                },
                "regra_importante_variaveis": "CRÍTICO: NUNCA inclua placeholders como {{nome_contato}} na resposta final."
            },
            "contexto_conhecimento": {
                "descricao": "Fonte de verdade primária para responder perguntas. Use estes dados antes do seu conhecimento geral.",
                "planilhas": contexto_sheets_processado or {"aviso": "Nenhum dado de planilha disponível."},
            },
            "arquivos_disponiveis": {
                "descricao": "Estrutura de arquivos que você pode sugerir ao cliente. Se for enviar um, retorne o 'id' do arquivo no campo 'arquivos_anexos' da resposta.",
                "estrutura": arquivos_drive_processado or {"aviso": "Nenhum arquivo do Drive disponível."}
            },
            "dados_atuais_conversa": {
                "contato_nome": contact.nome,
                "contato_numero": contact.whatsapp,
                "contato_observacoes": contact.observacoes,
                "tarefa_imediata": task_map.get(mode, "Continuar a conversa de forma coerente."),
                "historico_conversa": formatted_history
            }
        }

        final_prompt_str = json.dumps(master_prompt, ensure_ascii=False, indent=2, cls=SetEncoder)
        max_retries = 3
        last_error = None

        for attempt in range(max_retries):
            try:
                response = await self._generate_with_retry_async(final_prompt_str, db, user, force_json=True)
                clean_response_text = response.text.strip().replace("```json", "").replace("```", "")
                response_data = json.loads(clean_response_text)
                
                print(response_data)

                # Validação da resposta: verifica se a mensagem não é nula ou vazia (após remover espaços)
                # A exceção é o modo 'followup', onde uma mensagem vazia pode ser intencional.
                message_to_send = response_data.get("mensagem_para_enviar")
                if mode != 'followup' and (message_to_send is None or not str(message_to_send).strip()):
                    logger.warning(f"Tentativa {attempt + 1}/{max_retries}: IA gerou mensagem vazia. Tentando novamente...")
                    last_error = "IA gerou mensagem vazia."
                    await asyncio.sleep(1)  # Pequena pausa antes de tentar novamente
                    continue

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
            "observacoes": f"Falha da IA após {max_retries} tentativas: {last_error}"
        }

    async def analyze_prospecting_data(
        self,
        db: AsyncSession,
        user: models.User,
        question: str,
        start_date: Optional[datetime],
        end_date: Optional[datetime]
    ) -> Dict[str, Any]:
        """Usa a IA para analisar dados de prospecção com base em uma pergunta do usuário."""
        from app.crud import crud_prospect, crud_config

        logger.info(f"Iniciando análise de dados de prospecção para user_id={user.id} com a pergunta: '{question[:100]}...'")

        # Coletar dados relevantes
        prospects = await crud_prospect.get_prospects_by_user(db, user_id=user.id)
        simplified_prospects = []
        for p in prospects:
            if p.created_at.replace(tzinfo=timezone.utc) >= start_date and p.created_at.replace(tzinfo=timezone.utc) <= end_date:
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
                "prospeccoes_no_periodo": simplified_prospects
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
        
        response = await self._generate_with_retry_async(json.dumps(analysis_prompt, ensure_ascii=False, cls=SetEncoder), db, user, force_json=True)
        return json.loads(response.text)

_gemini_service_instance = None
def get_gemini_service():
    global _gemini_service_instance
    if _gemini_service_instance is None:
        _gemini_service_instance = GeminiService()
    return _gemini_service_instance