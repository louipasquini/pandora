# Quickstart — CRM · Tarefas

Pré-requisitos: ambiente já rodando conforme `README.md` (Postgres dev na 55432, backend
na 3001, frontend na 5174), migrações aplicadas (`npm run db:migrate`), usuário
`administrador` autenticado (`POST /auth/token`).

## 1. Criar uma tarefa pessoal com checklist e prazo

```bash
curl -s -X POST http://localhost:3001/crm/tarefas \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"titulo":"Ligar para retomar negociação","dataVencimento":"2026-09-12T15:00:00Z","checklist":["Revisar histórico","Ligar","Registrar resultado"]}'
```

Esperado: `201`, `status: "PENDENTE"`, `progressoChecklist: {concluidos:0,total:3}`.

## 2. Marcar item do checklist e concluir

```bash
curl -s -X PATCH http://localhost:3001/crm/tarefas/$ID/checklist/$ITEM_ID \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"concluido":true}'

curl -s -X POST http://localhost:3001/crm/tarefas/$ID/status \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"CONCLUIDA"}'
```

Esperado: `200`, `status: "CONCLUIDA"`, `concluidoEm` preenchido (checklist incompleto não
bloqueia conclusão — só dependência bloqueia).

## 3. Cronômetro

```bash
curl -s -X POST http://localhost:3001/crm/tarefas/$ID2/cronometro/iniciar -H "Authorization: Bearer $TOKEN"
sleep 2
curl -s -X POST http://localhost:3001/crm/tarefas/$ID2/cronometro/parar -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:3001/crm/tarefas/$ID2 -H "Authorization: Bearer $TOKEN" | jq .tempoTotalSegundos
```

Esperado: `tempoTotalSegundos >= 2`.

## 4. Dependência entre tarefas

```bash
curl -s -X POST http://localhost:3001/crm/tarefas/$TAREFA_2/dependencias \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"dependeDeId\":\"$TAREFA_1\"}"

curl -s -X POST http://localhost:3001/crm/tarefas/$TAREFA_2/status \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"status":"CONCLUIDA"}'
```

Esperado: `409` (dependência pendente) até `$TAREFA_1` ser concluída — repita o `POST
.../status` depois de concluir `$TAREFA_1` e confirme `200`.

## 5. Ranking e notificações

```bash
curl -s "http://localhost:3001/crm/tarefas/ranking" -H "Authorization: Bearer $TOKEN"
curl -s "http://localhost:3001/crm/tarefas/notificacoes" -H "Authorization: Bearer $TOKEN"
```

Esperado: ranking traz o usuário que concluiu tarefas no passo 2 com pontos > 0;
notificações trazem qualquer tarefa `PENDENTE`/`EM_ANDAMENTO` vencendo hoje/atrasada do
sujeito autenticado.

## 6. Geração automática via Workflow

No painel **CRM · Workflow** (spec 014), edite um fluxo (ex.: gatilho `LEAD_ESTAGIO_MUDOU`)
e adicione a ação **Criar tarefa** (título, prazo relativo em dias, responsável opcional).
Publique o fluxo, dispare o gatilho (mude o estágio de um lead que case a condição) e rode
`POST /crm/workflow/processar` (ou aguarde o `WorkerScheduler`). Confirme em
`GET /crm/tarefas?leadId=$LEAD_ID` que uma tarefa nova apareceu, ligada ao lead.

## Validação manual no navegador

Item **CRM · Tarefas** no menu (atrás de `tarefa:ver_todas`\|`ver_proprias`): abas
"Minhas"/"Gerais"/"Time" (se `ver_todas`), agenda por semana, detalhe da tarefa com
checklist/cronômetro/comentários/dependências/delegar, painel de ranking.
