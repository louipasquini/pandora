-- Executado uma vez na primeira subida do container Postgres do Compose.
-- Cria o banco de testes usado pelo harness (schema-per-worker roda dentro dele).
CREATE DATABASE pandora_test OWNER pandora;
