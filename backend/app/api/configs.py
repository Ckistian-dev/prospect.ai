from fastapi import APIRouter, Depends, HTTPException, status, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete
from typing import List, Dict, Any
import logging

from app.db.database import get_db
from app.db import models
from app.db.schemas import Config, ConfigCreate, ConfigUpdate
from app.crud import crud_config
from app.api.dependencies import get_current_active_user
from app.services.google_sheets_service import GoogleSheetsService
from app.services.google_drive_service import get_drive_service
from app.services.gemini_service import get_gemini_service

logger = logging.getLogger(__name__)
router = APIRouter()

# --- Funções Auxiliares de Engenharia de Dados ---

def format_sheet_to_csv_system(sheet_name: str, rows: List[Dict[str, Any]]) -> str:
    """
    Converte uma aba inteira em formato CSV para o System Prompt.
    """
    if not rows:
        return ""
    
    headers = list(rows[0].keys())
    lines = [f"# {sheet_name}", "|".join(headers)]
    
    for row in rows:
        values = [str(row.get(h, "") or "").strip().replace("\n", "\\n").replace("\r", "") for h in headers]
        lines.append("|".join(values))
        
    return "\n".join(lines)

def format_row_to_csv_rag(sheet_name: str, row: Dict[str, Any]) -> str:
    """
    Converte uma linha em formato CSV com cabeçalho para o RAG.
    """
    headers = []
    values = []
    
    for key, val in row.items():
        if val is not None:
            val_str = str(val).strip().replace("\n", "\\n").replace("\r", "")
            if val_str:
                headers.append(key)
                values.append(val_str)
    
    if not headers:
        return ""
    
    return f"# {sheet_name}\n" + "|".join(headers) + "\n" + "|".join(values)

def flatten_drive_tree(node: Dict[str, Any], path: str = "") -> List[str]:
    """Recursivamente achata a árvore de arquivos em linhas de texto estruturado."""
    lines = []
    current_name = node.get("nome", "Raiz")
    
    # Constrói caminho visual (ex: Marketing > Campanhas)
    current_path = f"{path} > {current_name}" if path else current_name
    
    for f in node.get("arquivos", []):
        # Formato CSV estilo Sheets RAG
        row_data = {
            "Categorias": current_path,
            "Arquivo": f.get('nome'),
            "Tipo": f.get('tipo'),
            "ID": f.get('id')
        }
        
        headers = []
        values = []
        
        for key, val in row_data.items():
            if val:
                val_str = str(val).strip().replace("\n", "\\n").replace("\r", "")
                headers.append(key)
                values.append(val_str)
        
        if headers:
            lines.append(f"# DRIVE\n" + "|".join(headers) + "\n" + "|".join(values))
        
    for sub in node.get("subpastas", []):
        lines.extend(flatten_drive_tree(sub, current_path))
        
    return lines

@router.post("/", response_model=Config, status_code=status.HTTP_201_CREATED)
async def create_config(
    config: ConfigCreate,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """Cria uma nova configuração para o usuário logado."""
    return await crud_config.create_config(db=db, config=config, user_id=current_user.id)

@router.get("/", response_model=List[Config])
async def read_configs(
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """Lista todas as configurações do usuário logado."""
    return await crud_config.get_configs_by_user(db=db, user_id=current_user.id)

@router.put("/{config_id}", response_model=Config)
async def update_config(
    config_id: int,
    config: ConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """Atualiza uma configuração existente."""
    db_config = await crud_config.get_config(db=db, config_id=config_id, user_id=current_user.id)
    if db_config is None:
        raise HTTPException(status_code=404, detail="Configuração não encontrada")
    return await crud_config.update_config(db=db, db_config=db_config, config_in=config)

@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_config(
    config_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """Deleta uma configuração."""
    db_config = await crud_config.delete_config(db=db, config_id=config_id, user_id=current_user.id)
    if db_config is None:
        raise HTTPException(status_code=404, detail="Configuração não encontrada")
    return

@router.get("/situations", summary="Listar situações possíveis para contatos")
async def get_situations(
    current_user: models.User = Depends(get_current_active_user)
):
    """Retorna a lista de situações possíveis para um contato de prospecção."""
    return [
        {"nome": "Aguardando Início", "cor": "#9ca3af"},
        {"nome": "Processando", "cor": "#3b82f6"},
        {"nome": "Aguardando Resposta", "cor": "#eab308"},
        {"nome": "Resposta Recebida", "cor": "#2563eb"},
        {"nome": "Lead Qualificado", "cor": "#16a34a"},
        {"nome": "Não Interessado", "cor": "#dc2626"},
        {"nome": "Atendente Chamado", "cor": "#f97316"},
        {"nome": "Concluído", "cor": "#059669"},
        {"nome": "Falha no Envio", "cor": "#7f1d1d"}
    ]

@router.post("/sync_sheet", summary="Sincronizar planilha do Google Sheets com uma Configuração")
async def sync_google_sheet(
    payload: Dict[str, Any] = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    config_id = payload.get("config_id")
    spreadsheet_id = payload.get("spreadsheet_id")
    sync_type = payload.get("type", "system") # 'system' ou 'rag'

    if not config_id:
        raise HTTPException(status_code=400, detail="config_id é obrigatório.")

    db_config = await crud_config.get_config(db=db, config_id=config_id, user_id=current_user.id)
    if not db_config:
        raise HTTPException(status_code=404, detail="Configuração não encontrada.")
    
    # Se um novo spreadsheet_id foi enviado, atualiza a configuração primeiro
    if spreadsheet_id:
        if sync_type == "rag":
            db_config.spreadsheet_rag_id = spreadsheet_id
        else:
            db_config.spreadsheet_id = spreadsheet_id
        db.add(db_config)
    
    # Após a possível atualização, verifica se há um spreadsheet_id para usar
    final_spreadsheet_id = db_config.spreadsheet_rag_id if sync_type == "rag" else db_config.spreadsheet_id
    
    if not final_spreadsheet_id:
        raise HTTPException(status_code=400, detail=f"Nenhum link de planilha ({sync_type}) associado. Salve o link primeiro.")

    try:
        sheets_service = GoogleSheetsService()
        gemini_service = get_gemini_service()
        sheet_data_json = await sheets_service.get_sheet_as_json(final_spreadsheet_id)
        
        prompt_buffer = []
        contextos_buffer = []

        # --- Lógica Separada por Tipo ---
        if sync_type == "system":
            # MODO SYSTEM: Todas as abas viram Prompt Fixo (CSV)
            for sheet_name, rows in sheet_data_json.items():
                csv_section = format_sheet_to_csv_system(sheet_name, rows)
                if csv_section:
                    prompt_buffer.append(csv_section)
            
            # Atualiza System Prompt
            db_config.prompt = "\n\n".join(prompt_buffer)

        elif sync_type == "rag":
            # MODO RAG: Gera embeddings
            rag_items = []
            for sheet_name, rows in sheet_data_json.items():
                for row in rows:
                    csv_content = format_row_to_csv_rag(sheet_name, row)
                    if csv_content:
                        rag_items.append({"content": csv_content, "origin": sheet_name})
            
            if rag_items:
                lines_to_embed = [item["content"] for item in rag_items]
                embeddings = await gemini_service.generate_embeddings_batch(lines_to_embed)
                
                # --- PROTEÇÃO CONTRA PERDA DE DADOS ---
                valid_embeddings = [e for e in embeddings if e]
                if not valid_embeddings and len(lines_to_embed) > 0:
                    raise HTTPException(status_code=500, detail="Falha crítica na geração de embeddings. A sincronização foi abortada para evitar perda de dados.")
                
                for item, embedding in zip(rag_items, embeddings):
                    if embedding:
                        contextos_buffer.append(models.KnowledgeVector(
                            config_id=db_config.id,
                            content=item["content"],
                            origin=item["origin"],
                            embedding=embedding
                        ))
            
            # Limpa vetores anteriores que NÃO sejam do Drive
            await db.execute(delete(models.KnowledgeVector).where(
                models.KnowledgeVector.config_id == db_config.id,
                models.KnowledgeVector.origin != "drive"
            ))
            if contextos_buffer:
                db.add_all(contextos_buffer)
        
        await db.commit()
        await db.refresh(db_config)

        return {
            "message": f"Sincronização ({sync_type.upper()}) Concluída", 
            "sheets_found": list(sheet_data_json.keys()),
            "prompt_size": len(db_config.prompt or "") if sync_type == "system" else 0,
            "vectors_created": len(contextos_buffer) if sync_type == "rag" else 0
        }
    
    except Exception as e:
        logger.error(f"Falha na rota sync_sheet: {e}", exc_info=True)
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Falha ao sincronizar planilha: {str(e)}")

@router.post("/sync_drive", summary="Sincronizar pasta do Google Drive")
async def sync_google_drive(
    payload: Dict[str, Any] = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    config_id = payload.get("config_id")
    drive_id = payload.get("drive_id")

    if not config_id:
        raise HTTPException(status_code=400, detail="config_id é obrigatório.")

    db_config = await crud_config.get_config(db=db, config_id=config_id, user_id=current_user.id)
    if not db_config:
        raise HTTPException(status_code=404, detail="Configuração não encontrada.")
    
    # Atualiza o ID da pasta se foi enviado
    if drive_id:
        db_config.drive_id = drive_id
    
    final_drive_id = db_config.drive_id
    if not final_drive_id:
        raise HTTPException(status_code=400, detail="Nenhum ID de pasta associado. Insira o ID da pasta do Google Drive.")

    try:
        drive_service = get_drive_service()
        gemini_service = get_gemini_service()
        drive_data = await drive_service.list_files_in_folder(final_drive_id)
        
        files_tree = drive_data.get("tree", {})
        files_count = drive_data.get("count", 0)

        # --- Lógica de Processamento de Dados ---
        # 1. Achata a árvore para lista de strings densas
        drive_lines = flatten_drive_tree(files_tree)
        
        # 2. Prepara vetores para RAG
        contextos_buffer = []
        if drive_lines:
            embeddings = await gemini_service.generate_embeddings_batch(drive_lines)
            
            # --- PROTEÇÃO CONTRA PERDA DE DADOS ---
            valid_embeddings = [e for e in embeddings if e]
            if not valid_embeddings and len(drive_lines) > 0:
                raise HTTPException(status_code=500, detail="Falha crítica na geração de embeddings do Drive. A sincronização foi abortada.")

            for line, embedding in zip(drive_lines, embeddings):
                if embedding:
                    contextos_buffer.append(models.KnowledgeVector(
                        config_id=db_config.id, 
                        content=line, 
                        origin="drive", 
                        embedding=embedding
                    ))

        # 3. Atualiza Vetores (Limpa anteriores da origem 'drive' e insere novos)
        await db.execute(delete(models.KnowledgeVector).where(
            models.KnowledgeVector.config_id == db_config.id,
            models.KnowledgeVector.origin == "drive"
        ))
        if contextos_buffer:
            db.add_all(contextos_buffer)

        await db.commit()
        await db.refresh(db_config)

        return {
            "message": "Drive sincronizado com Knowledge Base", 
            "files_count": files_count,
            "vectors_created": len(contextos_buffer)
        }
    
    except Exception as e:
        logger.error(f"Falha na rota sync_drive: {e}", exc_info=True)
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Falha ao sincronizar Drive: {str(e)}")
