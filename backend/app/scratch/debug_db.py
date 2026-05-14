import asyncio
import asyncpg
import json
import os

async def debug():
    # URL do banco da Evolution do .env
    db_url = "postgresql://evolution_user:Cjs2025*@localhost:5436/evolution_db"
    
    # Se falhar via localhost, tenta via host.docker.internal se estiver no windows
    # Mas como o usuário está no Windows, talvez localhost:5436 funcione se o DB estiver exposto.
    
    try:
        conn = await asyncpg.connect(db_url)
        print("Conectado ao banco da Evolution!")
        
        target_jid = "83180849770637@lid"
        print(f"Buscando mensagens para: {target_jid}")
        
        query = """
            SELECT "key", "message", "messageTimestamp", "messageType"
            FROM "Message"
            WHERE "key"->>'remoteJid' = $1
            ORDER BY "messageTimestamp" DESC
            LIMIT 5
        """
        rows = await conn.fetch(query, target_jid)
        
        for row in rows:
            print("-" * 50)
            print(f"Timestamp: {row['messageTimestamp']}")
            print(f"Type: {row['messageType']}")
            print(f"Message JSON: {row['message']}")
            
        await conn.close()
    except Exception as e:
        print(f"Erro: {e}")

if __name__ == "__main__":
    asyncio.run(debug())
