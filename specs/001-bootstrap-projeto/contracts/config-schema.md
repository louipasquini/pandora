# Contract: variáveis de ambiente (`.env`)

Fonte de verdade: `backend/src/config/env.schema.ts` (zod). O `.env.example` na raiz do
repositório espelha **todas** as chaves abaixo com valores inertes. `.env` real é
git-ignored (FR-033/FR-034).

## Comportamento

- No boot do backend, `envSchema.parse(process.env)` roda. Falha → processo aborta com o
  caminho da chave inválida/ausente no stderr (FR-008, SC-006). **Nunca** há fallback
  silencioso para segredo ou string de conexão.
- O tipo `AppConfig = z.infer<typeof envSchema>` é a única fonte de tipo de config no
  backend; injetado via `ConfigService<AppConfig, true>`.

## Chaves

### Runtime

| Chave | Tipo / validação | Obrigatória | Exemplo (`.env.example`) |
| --- | --- | --- | --- |
| `NODE_ENV` | enum `development` \| `test` \| `production` | sim (default `development` só no example) | `development` |
| `PORT` | inteiro 1–65535 | sim | `3001` |
| `VITE_PORT` | inteiro 1–65535 (lido pelo frontend, não pelo zod do backend) | não | `5174` |

### Banco

| Chave | Tipo / validação | Obrigatória | Exemplo |
| --- | --- | --- | --- |
| `DATABASE_URL` | URL `postgres://` | sim | `postgres://pandora:pandora@localhost:55432/pandora` |
| `TEST_DATABASE_URL` | URL `postgres://` | sim quando `NODE_ENV=test` ou ao rodar a suíte (FR-015) | `postgres://pandora:pandora@localhost:55432/pandora_test` |

### Autenticação de serviço (usada de fato na spec 003)

| Chave | Tipo / validação | Obrigatória | Exemplo |
| --- | --- | --- | --- |
| `SERVICE_JWT_SECRET` | string, comprimento ≥ 32 | **não** nesta spec (a 003 promove) | `change-me-in-003-xxxxxxxxxxxxxxxxxxxx` |
| `SERVICE_CLIENT_ID` | string | não (003) | `pandora-panel` |
| `SERVICE_CLIENT_SECRET` | string ≥ 16 | não (003) | `change-me-in-003-yyyyyyyy` |

### Contas de origem — 7 blocos (dimensão de primeira classe)

Para cada conta `C` ∈ `{ TMB, ASAAS_PRD, ASAAS_SVC, GURU_PRD, GURU_SVC, HOTMART_PRD,
HOTMART_SVC }`:

| Chave | Tipo / validação | Obrigatória | Exemplo |
| --- | --- | --- | --- |
| `C_API_BASE_URL` | URL http(s) | **não** nesta spec (specs de adapter promovem por conta) | `https://api.exemplo.invalido/` |
| `C_API_KEY` | string | não | `placeholder` |
| `C_WEBHOOK_TOKEN` | string | não | `placeholder` |

→ 21 chaves de conta no total. Todas presentes no schema e no `.env.example`, todas
opcionais aqui. Nenhuma é lida fora de um adapter (que não existe nesta spec).

## Teste de contrato

`backend/src/config/env.schema.spec.ts` (unit, sem banco):

1. `.env.example` (parseado) passa por `envSchema.parse` sem erro.
2. Remover `DATABASE_URL` → `parse` lança e a mensagem cita `DATABASE_URL`.
3. `PORT="abc"` → `parse` lança citando `PORT`.
4. Omitir todas as chaves de conta → `parse` **não** lança (opcionais nesta spec).
5. `SERVICE_JWT_SECRET` com 10 chars → `parse` lança citando comprimento mínimo (a regra já
   existe, só a obrigatoriedade é adiada).
