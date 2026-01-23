from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta, timezone
from app.core.config import settings
from app.db.schemas import TokenData
from cryptography.fernet import Fernet
import logging

logger = logging.getLogger(__name__)

try:
    # Carrega a chave do .env
    encryption_key = settings.ENCRYPTION_KEY.encode() if hasattr(settings, 'ENCRYPTION_KEY') and settings.ENCRYPTION_KEY else Fernet.generate_key()
    cipher_suite = Fernet(encryption_key)
except Exception as e:
    logger.warning(f"ENCRYPTION_KEY não definida ou inválida. Criptografia desabilitada. {e}")
    cipher_suite = None

# Contexto para hashing de senhas
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Esquema OAuth2 que aponta para a rota de login
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica se a senha fornecida corresponde ao hash salvo."""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Gera o hash de uma senha."""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Cria um novo token de acesso JWT."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

# Esta função será movida para as dependências da API para ter acesso ao DB
async def get_current_user_token_data(token: str = Depends(oauth2_scheme)) -> TokenData:
    """
    Decodifica o token JWT para obter o usuário atual.
    Esta função apenas valida o token e extrai os dados. A busca no DB
    será feita em uma dependência separada.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Não foi possível validar as credenciais",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = TokenData(email=email)
    except JWTError:
        raise credentials_exception
    return token_data

def encrypt_token(token: str) -> str:
    """Criptografa um token de texto plano."""
    if not cipher_suite:
        logger.error("Tentativa de criptografar token sem cipher_suite. ENCRYPTION_KEY está faltando?")
        raise ValueError("Serviço de criptografia não inicializado.")
    
    encrypted_token = cipher_suite.encrypt(token.encode())
    return encrypted_token.decode()

def decrypt_token(encrypted_token: str) -> str:
    """Descriptografa um token."""
    if not cipher_suite:
        logger.error("Tentativa de descriptografar token sem cipher_suite. ENCRYPTION_KEY está faltando?")
        raise ValueError("Serviço de criptografia não inicializado.")
        
    decrypted_token = cipher_suite.decrypt(encrypted_token.encode())
    return decrypted_token.decode()
