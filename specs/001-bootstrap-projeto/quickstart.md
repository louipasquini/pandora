# Quickstart — Validação da spec 001

Roteiro que prova o esqueleto ponta a ponta. Espelha a seção "Como rodar" que o README
ganha ao final desta spec (FR-029). Alvo: reproduzir a User Story 1 em ≤ 15 min (SC-001).

## Pré-requisitos

- Node.js 24 (`node -v` → `v24.x`; use `nvm use` — há `.nvmrc`).
- Docker + Docker Compose **ou** um PostgreSQL 16 acessível (alternativa documentada).
- `git`.

## Passo a passo

```bash
# 1. Clonar e instalar (raiz — npm workspaces instala backend e frontend)
git clone https://github.com/louipasquini/pandora.git
cd pandora
npm ci

# 2. Configuração
cp .env.example .env
#    edite .env só se for usar um Postgres próprio (troque DATABASE_URL / TEST_DATABASE_URL)

# 3. Subir o Postgres de desenvolvimento (porta host 55432)
docker compose up -d db
#    alternativa sem Docker: aponte DATABASE_URL/TEST_DATABASE_URL para seu Postgres e
#    crie os bancos `pandora` e `pandora_test`

# 4. Aplicar as migrações (baseline)
npm run -w backend prisma:migrate:deploy

# 5. Subir o backend (porta 3001) e o frontend (porta 5174) — dois terminais
npm run -w backend start:dev
npm run -w frontend dev
```

## Verificações esperadas

| # | Comando / ação | Resultado esperado | Cobre |
| --- | --- | --- | --- |
| V1 | `curl -s localhost:3001/health` | JSON `status:"ok"`, `db:"up"`, `contexts` com 11 nomes | US1, US2, FR-006, SC-002 |
| V2 | abrir `http://localhost:5174` | shell com header, nav lateral e área de conteúdo; cores da marca (azul/coral/menta) e fonte Inter visíveis | US4, FR-024, FR-027 |
| V3 | `npm run -ws --if-present typecheck` | sem erros em backend e frontend | US1, FR-018, SC-003 |
| V4 | `npm run -ws --if-present lint` | sem erros; import cross-contexto proibido dispara erro se introduzido | US2, FR-005, FR-017 |
| V5 | `npm run -w backend test` | suíte verde contra Postgres real; schema de teste criado e destruído | US1, FR-013/14, SC-004 |
| V6 | rodar V5 duas vezes em paralelo | ambas passam, sem colisão de schema | SC-004 |
| V7 | `npm run -w backend test` **sem** `TEST_DATABASE_URL` | falha com mensagem citando `TEST_DATABASE_URL` | FR-015 |
| V8 | remover `DATABASE_URL` do `.env` e `npm run -w backend start:dev` | boot aborta citando `DATABASE_URL`; nunca sobe "saudável" | FR-008, SC-006 |
| V9 | `npm run -w frontend test` | smoke do `AppShell` passa | FR-016 |
| V10 | abrir um PR de teste que quebra lint/tipo/teste | CI reprova, step identificável; PR limpo passa | US3, FR-020–022, SC-005 |

## Mapa contexto → módulo (referência rápida)

`backend/src/<contexto>/<contexto>.module.ts` para: `ingestao`, `financeiro`, `catalogo`,
`contratos`, `clientes`, `crm`, `marketing`, `central`, `core`, `api`, `admin`. Detalhe e
racional em [`docs/001-bootstrap-projeto.md`](../../docs/001-bootstrap-projeto.md).

## Fora de escopo desta validação

Login/JWT (003), value objects de dinheiro/tempo/status (002), qualquer entidade de
negócio, adapters, deploy.
