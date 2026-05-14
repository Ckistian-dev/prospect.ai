
import json
import logging

# Mock logger
class MockLogger:
    def info(self, msg): print(f"INFO: {msg}")
    def warning(self, msg): print(f"WARNING: {msg}")
    def error(self, msg, exc_info=False): print(f"ERROR: {msg}")

logger = MockLogger()

def format_evolution_message(raw_msg):
    try:
        if isinstance(raw_msg, str): raw_msg = json.loads(raw_msg)
        key = raw_msg.get("key", {})
        msg_content = raw_msg.get("message", {})
        if not msg_content:
            return {"id": key.get("id"), "content": "", "type": "text"}

        temp_msg = msg_content
        found_real_msg = False
        wrappers = ["ephemeralMessage", "viewOnceMessage", "viewOnceMessageV2", "documentWithCaptionMessage", "protocolMessage", "editedMessage", "message"]
        
        for _ in range(5):
            if not isinstance(temp_msg, dict): break
            found_wrap = False
            for wrap in wrappers:
                if wrap in temp_msg:
                    val = temp_msg[wrap]
                    if isinstance(val, dict):
                        if wrap == "protocolMessage" and "editedMessage" in val:
                            temp_msg = val["editedMessage"]
                        elif "message" in val and isinstance(val["message"], dict):
                            temp_msg = val["message"]
                        else:
                            temp_msg = val
                        found_real_msg = True
                        found_wrap = True
                        break
            if not found_wrap: break

        if found_real_msg:
            msg_content = temp_msg

        content = ""
        raw_type = raw_msg.get("messageType") or ""
        msg_type = raw_type.replace("Message", "").lower() if raw_type else "text"
        if msg_type == "conversation": msg_type = "text"

        extra_data = {}
        if isinstance(msg_content, dict):
            content = (
                msg_content.get("conversation") or 
                msg_content.get("text") or
                msg_content.get("extendedTextMessage", {}).get("text") or 
                msg_content.get("contentText") or
                msg_content.get("caption") or ""
            )

            # Se ainda estiver vazio, tenta procurar dentro de um objeto 'message' aninhado
            if not content and "message" in msg_content and isinstance(msg_content["message"], dict):
                inner = msg_content["message"]
                content = inner.get("conversation") or inner.get("text") or inner.get("extendedTextMessage", {}).get("text") or ""

            for t in ["image", "video", "audio", "sticker", "document"]:
                key_name = f"{t}Message"
                if key_name in msg_content:
                    msg_type = t
                    media_obj = msg_content[key_name]
                    extra_data = {
                        "media_id": key.get("id"), 
                        "mime_type": media_obj.get("mimetype"),
                        "caption": media_obj.get("caption"),
                        "filename": media_obj.get("fileName") or media_obj.get("filename")
                    }
                    if not content:
                        content = extra_data["caption"] or f"[{t.capitalize()}]"
                    break
        else:
            content = str(msg_content) if msg_content else ""

        from_me = key.get("fromMe", False)
        role = "assistant" if from_me else "user"
        
        return {
            "id": key.get("id"),
            "role": role,
            "content": content,
            "type": msg_type,
            "timestamp": raw_msg.get("messageTimestamp"),
            **extra_data
        }
    except Exception as e:
        return {"error": str(e)}

# Test with CSV data
test_raw_msg = {
    "key": {"id": "123", "fromMe": False, "remoteJid": "abc@g.us"},
    "message": {"conversation": "Hello World", "messageContextInfo": {}},
    "messageType": "conversation",
    "messageTimestamp": 123456789
}

print("Test 1 (conversation):")
print(json.dumps(format_evolution_message(test_raw_msg), indent=2))

test_raw_msg_2 = {
    "key": {"id": "456", "fromMe": True},
    "message": {"imageMessage": {"caption": "Look at this", "mimetype": "image/jpeg"}},
    "messageType": "imageMessage"
}
print("\nTest 2 (imageMessage):")
print(json.dumps(format_evolution_message(test_raw_msg_2), indent=2))

test_raw_msg_3 = {
    "key": {"id": "789", "fromMe": False},
    "message": {"message": {"conversation": "Nested Hello"}},
    "messageType": "message"
}
print("\nTest 3 (nested message wrapper):")
print(json.dumps(format_evolution_message(test_raw_msg_3), indent=2))
