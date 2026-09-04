# Quickstart — 009-crm-interacao-timeline

Pré-requisitos: mesmos da raiz (`README.md`) — Node 24, Postgres dev em `55432` já rodando,
`.env` configurado, migrações + seed da 004–008 já aplicadas.

```bash
# 1. Aplicar a migração desta spec (7ª de negócio) e regenerar o client
npm run prisma:migrate:dev --workspace backend
#    (em CI/staging: npm run prisma:migrate:deploy --workspace backend)

# 2. Qualidade
npm run lint && npm run typecheck && npm run build

# 3. Testes
npm test                    # unit backend (ancora, mutabilidade, tag, filtro-segmento) + frontend
npm run test:e2e            # e2e contra Postgres real (schema isolado)

# 4. Subir e verificar
npm run start:dev --workspace backend   # :3001
npm run dev --workspace frontend        # :5174
curl http://localhost:3001/health       # contexts ainda = 11
```

## Fluxo manual (via `curl`, token de serviço — ver README raiz)

```bash
TOKEN=... # POST /auth/token

# Registrar uma interação numa pessoa
curl -sX POST localhost:3001/crm/interacoes -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"pessoaId":"<uuid>","tipo":"LIGACAO","direcao":"SAIDA","conteudo":"Retorno sobre dúvida"}'

# Nota interna
curl -sX POST localhost:3001/crm/interacoes -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"pessoaId":"<uuid>","tipo":"NOTA","conteudo":"Prefere contato à tarde"}'

# Timeline unificada da pessoa
curl -s localhost:3001/crm/pessoas/<uuid>/interacoes -H "Authorization: Bearer $TOKEN"

# Editar a nota
curl -sX PATCH localhost:3001/crm/interacoes/<id> -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"conteudo":"Prefere WhatsApp à tarde"}'

# Tag compartilhada
curl -sX POST localhost:3001/crm/pessoas/<uuid>/tags -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"tag":"Cliente VIP"}'
curl -s localhost:3001/crm/tags -H "Authorization: Bearer $TOKEN"

# Segmento dinâmico
curl -sX POST localhost:3001/crm/segmentos -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"nome":"Leads quentes webinar out","alvo":"LEAD","filtro":{"tags":["webinar-out"],"estagio":["QUALIFICADO"]}}'
curl -s localhost:3001/crm/segmentos/<id>/membros -H "Authorization: Bearer $TOKEN"
```

## Painel

`http://localhost:5174` → login → **Pessoas**/**CRM · Leads** → aba **Timeline** (composer +
lista); **CRM · Segmentos** (nova) → lista + membros.
