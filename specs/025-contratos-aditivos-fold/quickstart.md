# Quickstart: Contratos · Aditivos · Fold

## Rodar as migrações

```bash
npm run db:migrate
```

## Testes

```bash
npm run test --workspace backend                 # unitários (fold puro, domínio sem banco)
npm run test:e2e --workspace backend              # e2e contra Postgres real (schema isolado)
npm run test --workspace frontend
npm run lint --workspace backend && npm run lint --workspace frontend
npm run typecheck --workspace backend && npm run typecheck --workspace frontend
npm run build --workspace backend && npm run build --workspace frontend
```

## Ponta a ponta manual (via API, credencial de serviço)

1. `POST /auth/token` com `SERVICE_CLIENT_ID`/`SERVICE_CLIENT_SECRET` → JWT.
2. Ingerir 2 transações da mesma pessoa/produto (webhook TMB/Asaas/Guru/Hotmart, ou
   `POST /ingestao/eventos` cru) com `oferta` resolvida e `oferta_catalogo.tempoAcessoDias`
   já curado.
3. `POST /ingestao/eventos/processar` (dispara uma passada do worker — desligado em teste/e2e,
   liga sob demanda em dev).
4. `GET /contratos?pessoaId=<id>` → 1 contrato, `status_canonico` derivado.
5. `GET /contratos/:id` → linha do tempo com 2 aditivos (`COMPRA_INICIAL` +
   `RENOVACAO`/`PRORROGACAO`, conforme as datas).
6. `PATCH /contratos/:id` com `ajusteManualStatus: "CANCELADO"` + `motivo` → `GET` reflete o
   override.
7. Ingerir uma 3ª transação qualificada da mesma pessoa/produto e reprocessar → `GET` mostra
   que o override foi limpo (voltou ao valor derivado do fold) — o ajuste anterior continua em
   `contrato_audit` (sem endpoint de leitura dedicado nesta spec; consultar via banco/painel
   futuro de auditoria consolidada, spec 053 do ROADMAP).

## Painel

`Financeiro · Contratos` no menu (atrás de `contrato:ver`) → lista com filtros de produto/
turma/pessoa/status → detalhe com linha do tempo de aditivos e o formulário de ajuste manual
(atrás de `contrato:editar`).
