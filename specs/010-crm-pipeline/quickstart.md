# Quickstart — 010-crm-pipeline

Pré-requisitos: mesmos da raiz (`README.md`) — Node 24, Postgres dev em `55432` já rodando,
`.env` configurado, migrações + seed da 004–009 já aplicadas.

```bash
# 1. Aplicar a migração desta spec (8ª de negócio) e regenerar o client
npm run prisma:migrate:dev --workspace backend
#    (em CI/staging: npm run prisma:migrate:deploy --workspace backend)

# 2. Qualidade
npm run lint && npm run typecheck && npm run build

# 3. Testes
npm test                    # unit backend (sla, esfriando, atribuicao, movimentacao, metricas) + frontend
npm run test:e2e            # e2e contra Postgres real (schema isolado)

# 4. Subir e verificar
npm run start:dev --workspace backend   # :3001
npm run dev --workspace frontend        # :5174
curl http://localhost:3001/health       # contexts ainda = 11
```

## Fluxo manual (via `curl`, token de serviço — ver README raiz)

```bash
TOKEN=... # POST /auth/token

# Criar pipeline + etapas
curl -sX POST localhost:3001/crm/pipelines -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"nome":"Mentoria Avançada"}'
curl -sX POST localhost:3001/crm/pipelines/<pipelineId>/etapas -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"nome":"Novo contato","ordem":0,"tipo":"ABERTA"}'
curl -sX POST localhost:3001/crm/pipelines/<pipelineId>/etapas -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"nome":"Ganho","ordem":1,"tipo":"GANHA"}'
curl -sX POST localhost:3001/crm/pipelines/<pipelineId>/etapas -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"nome":"Perdido","ordem":2,"tipo":"PERDIDA"}'

# Criar oportunidade a partir de um lead
curl -sX POST localhost:3001/crm/oportunidades -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"pipelineId":"<pipelineId>","leadId":"<leadId>","titulo":"Mentoria 1:1","valorEstimado":{"valorInt":"50000000","moeda":"BRL"}}'

# Mover para etapa perdida (exige motivo)
curl -sX POST localhost:3001/crm/oportunidades/<id>/mover -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"etapaId":"<perdidoEtapaId>","motivo":"Optou por concorrente"}'

# Métricas do pipeline
curl -s localhost:3001/crm/pipelines/<pipelineId>/metricas -H "Authorization: Bearer $TOKEN"
```

## Painel

`http://localhost:5174` → login → **CRM · Pipelines** → seletor de pipeline → board Kanban
(colunas por etapa, drag-and-drop, modal de motivo ao soltar em etapa `PERDIDA`); aba
**Administração** do módulo → CRUD de pipeline/etapa/atribuição/campos personalizados
(atrás de `crm_admin:gerir_pipelines`).

## Validação end-to-end desta spec

1. Criar pipeline com equipe (007) de 2+ membros, `modoAtribuicao: RODIZIO`.
2. Criar 2 oportunidades sem `responsavelId` → confirmar que caem em membros diferentes.
3. Mover 1 delas para `PERDIDA` sem motivo → 422; com motivo → sucede.
4. Configurar `slaHoras` numa etapa, mover uma oportunidade para ela, e (via fixture de
   teste, não manualmente) confirmar `slaEstourado: true` após o limiar.
5. Abrir `GET /crm/pipelines/{id}/metricas` e conferir contagem/soma por etapa e
   `taxaConversao`.
