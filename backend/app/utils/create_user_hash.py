# --- Script Utilitário para Criar Hash de Senha ---
#
# Execute este arquivo diretamente no seu terminal para gerar
# uma senha criptografada (hash) que pode ser copiada e
# colada na sua planilha do Google Sheets.
#
# Como usar:
# 1. Salve este arquivo na raiz do seu projeto (mesma pasta do .env).
# 2. Abra o terminal nesta pasta.
# 3. Execute o comando: python create_user_hash.py
# 4. Digite a senha que deseja usar e pressione Enter.
# 5. Copie o hash gerado e cole na coluna 'senha' da sua planilha.

import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# --- Adiciona o diretório raiz do projeto ao sys.path ---
# Isso garante que o script possa encontrar o pacote 'app'
project_root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(project_root))

# Carrega as variáveis de ambiente do arquivo .env na pasta raiz ('backend')
env_path = project_root / '.env'
load_dotenv(dotenv_path=env_path)
# --- Fim da correção de path ---

from app.services.security import get_password_hash

def generate_hash():
    """
    Pede ao usuário uma senha e imprime o hash correspondente.
    """
    plain_password = input("Digite a senha que você quer usar para o login: ")
    
    if not plain_password:
        print("\n❌ A senha não pode ser vazia.")
        return

    hashed_password = get_password_hash(plain_password)
    
    print("\n" + "="*50)
    print("✅ HASH GERADO COM SUCESSO!")
    print("Copie a linha abaixo (sem as aspas) e cole na coluna 'senha' da sua planilha:")
    print("\n" + hashed_password)
    print("="*50 + "\n")


if __name__ == "__main__":
    generate_hash()
