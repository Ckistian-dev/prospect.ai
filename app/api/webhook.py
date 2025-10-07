import logging
from fastapi import APIRouter, Request, BackgroundTasks, HTTPException
from app.db.database import SessionLocal
from app.crud import crud_user, crud_prospect

logger = logging.getLogger(__name__)
router = APIRouter()

# --- FUNÇÃO DE NORMALIZAÇÃO ADICIONADA ---
def _normalize_number(number: str) -> str:
    """
    Garante que o número de celular brasileiro seja processado sem o nono dígito.
    Ex: Converte '5545999861237' (13 dígitos) para '554599861237' (12 dígitos).
    """
    clean_number = "".join(filter(str.isdigit, str(number)))
    
    if len(clean_number) == 13 and clean_number.startswith("55"):
        subscriber_part = clean_number[4:]
        if subscriber_part.startswith('9'):
            normalized = clean_number[:4] + subscriber_part[1:]
            logger.info(f"Normalizando número do webhook de {clean_number} para {normalized}")
            return normalized
            
    return clean_number

async def set_prospect_status_to_received(data: dict):
    """
    Função de background que encontra o contato de prospecção ativo e atualiza 
    seu status para 'Resposta Recebida', sinalizando ao agente para processar.
    """
    async with SessionLocal() as db:
        try:
            instance_name = data.get('instance')
            message_data = data.get('data', {})
            key = message_data.get('key', {})
            contact_number_full = key.get('remoteJid', '')

            if not contact_number_full or "@g.us" in contact_number_full:
                if "@g.us" in contact_number_full:
                    logger.info(f"Mensagem de grupo ignorada: {contact_number_full}")
                return

            contact_number = contact_number_full.split('@')[0]
            
            # --- NORMALIZAÇÃO APLICADA AQUI ---
            normalized_contact_number = _normalize_number(contact_number)
            
            user = await crud_user.get_user_by_instance(db, instance_name=instance_name)
            if not user:
                logger.warning(f"Webhook (Prospect): Usuário não encontrado para a instância {instance_name}")
                return

            # A busca no banco de dados agora usa o número já padronizado
            # (Lembrando que a função find_active_prospect_contact_by_number já é robusta e busca por variações)
            prospect_info = await crud_prospect.find_active_prospect_contact_by_number(db, user_id=user.id, number=normalized_contact_number)
            if not prospect_info:
                logger.info(f"Webhook (Prospect): Nenhuma prospecção ativa encontrada para o número {contact_number} (buscado como {normalized_contact_number})")
                return
            
            _contact, prospect_contact, _prospect = prospect_info

            # Verifica se o contato está em um estado que impede o processamento de novas mensagens
            situacoes_de_parada = ["Não Interessado", "Concluído", "Lead Qualificado", "Falha no Envio"]
            if prospect_contact.situacao in situacoes_de_parada:
                logger.info(f"Mensagem de {contact_number} ignorada. Contato da Prospecção ID {prospect_contact.id} com status '{prospect_contact.situacao}'.")
                return

            # A única responsabilidade do webhook é sinalizar que uma nova mensagem chegou.
            await crud_prospect.update_prospect_contact_status(db, pc_id=prospect_contact.id, situacao="Resposta Recebida")
            
            await db.commit()
            logger.info(f"Contato da Prospecção ID {prospect_contact.id} para {contact_number} marcado como 'Resposta Recebida'. O agente irá processar.")

        except Exception as e:
            await db.rollback()
            logger.error(f"ERRO CRÍTICO no webhook simplificado (Prospect): {e}", exc_info=True)


@router.post("/evolution/messages-upsert", summary="Receber eventos de novas mensagens")
async def receive_evolution_messages_upsert(request: Request, background_tasks: BackgroundTasks):
    try:
        data = await request.json()
        is_new_message = (
            data.get("event") == "messages.upsert" and
            not data.get("data", {}).get("key", {}).get("fromMe", False)
        )

        if is_new_message:
            background_tasks.add_task(set_prospect_status_to_received, data)

        return {"status": "message_triggered"}
    except Exception as e:
        logger.error(f"Erro ao processar corpo do webhook (Prospect): {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON data")