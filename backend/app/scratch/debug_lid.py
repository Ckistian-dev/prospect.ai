import asyncio
import asyncpg
import json
import os
from dotenv import load_dotenv

async def debug_lid_messages():
    # Carrega variveis de ambiente do .env se existir
    env_path = os.path.join(os.getcwd(), 'backend', '.env')
    if os.path.exists(env_path):
        load_dotenv(env_path)
    elif os.path.exists('.env'):
        load_dotenv('.env')
    
    db_url = os.getenv("EVOLUTION_DATABASE_URL")
    if not db_url:
        print("EVOLUTION_DATABASE_URL não encontrada.")
        return

    db_url = db_url.replace("postgresql+asyncpg://", "postgresql://")
    
    target_lid = "28244225061098@lid"
    
    try:
        conn = await asyncpg.connect(db_url)
        print(f"Conectado ao banco para depurar LID: {target_lid}")
        
        # 1. Buscar as últimas 10 mensagens para ver se alguma tem conteúdo
        query_msg = """
            SELECT "key", "message", "messageType", "messageTimestamp"
            FROM "Message"
            WHERE "key"->>'remoteJid' = $1
               OR "key"->>'remoteJidAlt' = $1
            ORDER BY "messageTimestamp" DESC
            LIMIT 10
        """
        rows = await conn.fetch(query_msg, target_lid)
        
        print(f"\nÚltimas 5 mensagens para {target_lid}:")
        for i, row in enumerate(rows):
            print(f"\n--- Mensagem {i+1} ---")
            print(f"Type: {row['messageType']}")
            print(f"Timestamp: {row['messageTimestamp']}")
            print(f"Key: {row['key']}")
            print(f"Message Raw: {row['message']}")
            
            msg_obj = row['message']
            if isinstance(msg_obj, str):
                try:
                    msg_obj = json.loads(msg_obj)
                except:
                    pass
            print(f"Message Parsed: {json.dumps(msg_obj, indent=2)}")

        await conn.close()
    except Exception as e:
        print(f"Erro: {e}")

if __name__ == "__main__":
    asyncio.run(debug_lid_messages())
