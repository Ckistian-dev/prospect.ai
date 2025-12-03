#!/bin/bash
set -e

# Executa o psql como o usuário postgres para criar o banco de dados e o usuário para a Evolution API.
# As variáveis de ambiente (como $POSTGRES_USER, $EVOLUTION_DB_NAME, etc.) são passadas
# do docker-compose.yml para o contêiner.

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Cria o usuário para a Evolution API, se ele ainda não existir.
    DO \$\$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${EVOLUTION_DB_USER}') THEN
            CREATE USER ${EVOLUTION_DB_USER} WITH PASSWORD '${EVOLUTION_DB_PASS}' CREATEDB;
        END IF;
    END \$\$;
    -- Cria o banco de dados para a Evolution API e define o usuário criado como o dono.
    CREATE DATABASE ${EVOLUTION_DB_NAME} OWNER ${EVOLUTION_DB_USER};
EOSQL