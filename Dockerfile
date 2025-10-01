# Use uma imagem base oficial do Python
FROM python:3.11-slim

# Define o diretório de trabalho dentro do contêiner
WORKDIR /app

# Cria um ambiente virtual não ativado (vamos usar os caminhos diretos)
RUN python3 -m venv /opt/venv
# Expõe o venv no PATH para que comandos como `python` e `pip` o usem por padrão
ENV PATH="/opt/venv/bin:$PATH"

# Copia APENAS o arquivo de dependências primeiro
COPY requirements.txt .

# Instala as dependências (isso só será re-executado se requirements.txt mudar)
RUN pip install -r requirements.txt

# Agora, copia o resto do código da sua aplicação
COPY . .

# Comando para iniciar sua aplicação (exemplo para FastAPI com Uvicorn)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]