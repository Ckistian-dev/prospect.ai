
import asyncpg
import asyncio
import json
import os

async def test():
    # Try to get DB URL from environment or use a common one
    db_url = "postgresql://evolution_user:Cjs2025*@localhost:5436/evolution_db"
    
    try:
        conn = await asyncpg.connect(db_url)
        print(f"Connected to {db_url}")
        
        # Get some jids first to be sure
        jids = await conn.fetch('SELECT DISTINCT "key"->>\'remoteJid\' as jid FROM "Message" LIMIT 5')
        print(f"Sample JIDs: {[r['jid'] for r in jids]}")
        
        if jids:
            target_jid = jids[0]['jid']
            print(f"Querying messages for {target_jid}")
            rows = await conn.fetch('SELECT "key", "message", "messageType" FROM "Message" WHERE "key"->>\'remoteJid\' = $1 LIMIT 5', target_jid)
            
            results = []
            for r in rows:
                results.append({
                    "key": json.loads(r["key"]) if isinstance(r["key"], str) else r["key"],
                    "message": json.loads(r["message"]) if isinstance(r["message"], str) else r["message"],
                    "messageType": r["messageType"]
                })
            print(json.dumps(results, indent=2))
        
        await conn.close()
    except Exception as e:
        print(f"Error: {e}")

asyncio.run(test())
