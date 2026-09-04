# Quickstart — 012-crm-chat-ao-vivo

Pré-requisitos: mesmos da raiz (`README.md`) — Node 24, Postgres dev em `55432` já rodando
(container `pandora-db`, verificado ativo no início desta sessão via `docker ps`/`ss -ltn` —
`3001`/`5174` livres, sem necessidade de portas alternativas como a 010 precisou usar),
`.env` configurado, migrações + seed da 004–011 já aplicadas.

```bash
# 1. Aplicar a migração desta spec (10ª de negócio) e regenerar o client
npm run prisma:migrate:dev --workspace backend
#    (em CI/staging: npm run prisma:migrate:deploy --workspace backend)

# 2. Qualidade
npm run lint && npm run typecheck && npm run build

# 3. Testes
npm test                    # unit backend (roteamento, sla, fila, csat) + frontend
npm run test:e2e            # e2e contra Postgres real (schema isolado)

# 4. Subir e verificar
npm run start:dev --workspace backend   # :3001
npm run dev --workspace frontend        # :5174
curl http://localhost:3001/health       # contexts ainda = 11
```

## Fluxo manual (via `curl`, token de serviço — ver README raiz)

```bash
TOKEN=... # POST /auth/token

# Configurar equipe de atendimento (SLA + mensagem fora do expediente)
curl -sX PATCH localhost:3001/crm/admin/atendimento/equipes/<equipeAtendimentoId> \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"slaPrimeiraRespostaMinutos":15,"mensagemForaExpediente":"Nossa equipe volta às 9h!"}'

# Fila de atendimento (aguardando/em andamento, com SLA calculado na leitura)
curl -s "localhost:3001/crm/atendimentos?status=AGUARDANDO,EM_ATENDIMENTO" \
  -H "Authorization: Bearer $TOKEN"

# Assumir um item da fila
curl -sX POST localhost:3001/crm/atendimentos/<id>/assumir -H "Authorization: Bearer $TOKEN"

# Responder (canal MANUAL — sem depender de um envio real de WhatsApp)
curl -sX POST localhost:3001/crm/atendimentos/<id>/responder \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"conteudo":"Oi! Como posso ajudar?","viaIa":false}'

# Transferir para outro atendente
curl -sX POST localhost:3001/crm/atendimentos/<id>/transferir \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"paraAtendenteId":"<usuarioId>","motivo":"cliente pediu financeiro"}'

# Encerrar (marca elegível para CSAT)
curl -sX POST localhost:3001/crm/atendimentos/<id>/encerrar \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{}'

# Registrar CSAT manualmente
curl -sX POST localhost:3001/crm/atendimentos/<id>/csat \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"nota":9,"comentario":"Rápido, resolveu na hora"}'

# Timeline completa do atendimento (mesma interacao da spec 009, filtrada)
curl -s localhost:3001/crm/atendimentos/<id>/timeline -H "Authorization: Bearer $TOKEN"
```

## Painel

`http://localhost:5174` → login → **CRM · Chat ao Vivo** → fila ordenada por prioridade/
tempo de espera com indicador de SLA → abrir uma conversa reaproveita `TimelineInteracoes`
(009) + composer de resposta + ações (assumir/transferir/encerrar) + badge de CSAT quando
existente; aba de administração do módulo (SLA/mensagem fora do expediente por equipe) sob
`crm_admin:gerir_atendimento`.

## Validação end-to-end desta spec

1. Configurar uma equipe `ATENDIMENTO` com uma janela de expediente (007) que cubra "agora"
   e dois membros ativos.
2. Simular o recebimento de 2 mensagens de WhatsApp de números diferentes (dublê de
   `GraphApiClient`/webhook, mesmo suporte de teste da 011) — verificar que 2 atendimentos
   são criados, cada um endereçado a um atendente distinto (menor carga — com carga inicial
   igual, o desempate por menor `usuarioId` é determinístico e assim testável).
3. Assumir manualmente um atendimento sem atendente (equipe fora de expediente) e responder
   — verificar `primeiraRespostaEm` preenchido e SLA deixando de estourar.
4. Transferir um atendimento em andamento para outro atendente — verificar
   `GET .../timeline` idêntica antes/depois e `GET .../transferencias` com 1 registro.
5. Encerrar o atendimento e registrar CSAT — verificar 2ª tentativa de CSAT recusada (409).
6. Simular uma mensagem chegando fora do expediente com `mensagemForaExpediente`
   configurada — verificar exatamente 1 interação automática de saída, e que uma 2ª mensagem
   da mesma pessoa não gera um 2º aviso.
