# Dockerfile

# --- Estágio 1: Builder ---
# Este estágio instala as dependências e o ambiente virtual.
# Usamos uma imagem base específica do Python para reprodutibilidade.
FROM python:3.11-slim-bookworm AS builder

# Define o diretório de trabalho
WORKDIR /app

# Instala pacotes do sistema necessários para construir algumas bibliotecas Python (se necessário)
# Isso é útil para pacotes que compilam código C, como certas bibliotecas de criptografia ou data science.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Cria um ambiente virtual dentro do contêiner
RUN python -m venv /opt/venv

# Copia apenas o arquivo de requisitos primeiro para aproveitar o cache do Docker
COPY requirements.txt .

# Instala as dependências Python dentro do ambiente virtual
# O --no-cache-dir reduz o tamanho da imagem
RUN /opt/venv/bin/pip install --no-cache-dir -r requirements.txt


# --- Estágio 2: Final ---
# Este é o estágio que gera a imagem final, que será muito menor.
FROM python:3.11-slim-bookworm

# Define o diretório de trabalho
WORKDIR /app

# Instala APENAS as dependências de sistema necessárias para RODAR a aplicação.
# Aqui é onde entra o ffmpeg, que era definido no nixpacks.toml.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copia o ambiente virtual com as dependências instaladas do estágio "builder"
COPY --from=builder /opt/venv /opt/venv

# Adiciona o ambiente virtual ao PATH do sistema.
# Isso garante que os comandos `python` e `uvicorn` usem o venv.
ENV PATH="/opt/venv/bin:$PATH"

# Copia todo o código da sua aplicação para o diretório de trabalho
COPY . .

# Expõe a porta que a aplicação vai usar. Isso é mais para documentação.
# A porta real será definida pela variável de ambiente PORT.
EXPOSE 8080

# Define o comando para iniciar a aplicação, traduzindo o que estava no nixpacks.toml.
# A sintaxe ${PORT:-8080} usa a variável de ambiente PORT, se ela for fornecida.
# Se não for, ele usa 8080 como um valor padrão (ótimo para testes locais).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]