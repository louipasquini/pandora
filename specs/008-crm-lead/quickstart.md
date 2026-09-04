# Quickstart — 008 crm-lead

Guia de validação. Não contém código de implementação — ver `data-model.md` e `contracts/`.

## Pré-requisitos

- Specs 001–007 aplicadas; Postgres dev de pé (host `55432`, `docker compose up -d db`).
- Node 24, `npm ci` na raiz (workspaces `backend`/`frontend`).
- **Nenhuma variável de ambiente nova** — a `PortaIdentidade` é código, não config.
- **Nenhuma porta nova** — backend `3001`, frontend `5174`, Postgres `55432`.

## Migração

```bash
cd backend
npx prisma migrate dev            # aplica <ts>_crm_lead (4 tabelas + 3 enums)
npx prisma generate
```

Confirma no banco: `lead`, `campo_personalizado_lead`, `valor_campo_lead`, `crm_lead_audit`;
o índice único **parcial** `lead_origem_id_externo_key` (`\d lead` no psql mostra
`... WHERE (id_externo IS NOT NULL)`); `campo_personalizado_lead.chave` único;
`valor_campo_lead` com `@@unique(lead_id, definicao_id)`.

## Portões estáticos

```bash
# na raiz
npm run lint          # import/no-restricted-paths: NENHUM import de src/clientes/** em src/crm/**
npm run typecheck
npm run build
```

Asserção estrutural: `grep -R "clientes" backend/src/crm/ --include='*.ts'` → só comentários
(0 `import`).

## Unit (sem banco)

```bash
cd backend && npm run test -- crm/domain/lead
```

Cobre:
- `scoring.spec.ts` — tabela de casos de `contracts/scoring.md` (determinismo, completude
  sobe o score, clamp `[0,100]`, base do lead novo = 31, decaimento por idade);
- `normalizar-lead.spec.ts` — tags/e-mail/telefone/documento (DV);
- `plano-conversao.spec.ts` — `podeConverter` (ATIVO/DESCARTADO/CONVERTIDO),
  `montarDadosIdentidade`.

Matriz de fuso (a CI roda `TZ` ∈ {UTC, America/Sao_Paulo, Asia/Tokyo}):

```bash
TZ=Asia/Tokyo npm run test -- crm/domain/lead/scoring
```

O `score` **não muda** com o `TZ`.

## e2e (Postgres real)

```bash
cd backend && npm run test:e2e -- crm-lead
```

Cenários (resumo — detalhe em `contracts/`):

1. **Migração**: schema isolado sobe, `db seed` não quebra, tabelas + índices/uniques
   presentes.
2. **CRUD**: `POST` cria `NOVO`/`ATIVO` + `score` + 1 audit; `POST` sem contato → 422;
   `POST` com e-mail já usado por lead ATIVO → cria + `leadsSemelhantes`; `PATCH` estágio +
   responsável → `score` recalculado + 1 audit com delta; `PATCH` no-op → 0 audit;
   `PATCH { score }` → 422; `responsavelId` inexistente → 404/422; tag normalizada, sem
   duplicar; tag vazia → 422.
3. **Escopo de visão**: sujeito só `lead:ver_proprios` — `GET /crm/leads` traz só os dele;
   `GET /crm/leads/:idDeOutro` → 404; `?responsavelId=<outro>` → lista vazia; lead sem
   responsável → invisível. Sujeito `lead:ver_todos` → vê tudo, inclusive fila não
   atribuída. Sem nenhuma das duas → 403 em todos os `GET /crm/leads*`.
4. **Scoring**: `POST /crm/leads/:id/recalcular-score` 5× → `score` estável; lote 2× → 0
   diff na 2ª execução; `score` sempre inteiro `[0,100]`.
5. **Conversão** (`contracts/leads-conversao.md`): `pessoa` com e-mail `x` + lead com e-mail
   `x` → `converter` aponta p/ a pessoa existente, 0 pessoa nova; lead com e-mail novo →
   pessoa nova; converter 2× → mesmo `pessoaId`, 0 contato duplicado, 0 audit novo; sem
   `pessoa:editar` → 403; lead `DESCARTADO` → 409; 1 `crm_lead_audit` `converter` com delta
   `{status, pessoa_id}`. **Asserção-chave**: `grep` de import de `clientes` em `src/crm` =
   0; ESLint verde.
6. **Campos personalizados** (`contracts/campos-personalizados.md`): `POST
   /crm/admin/campos-lead` cria definição (`SELECAO` sem `opcoes` → 422; `chave` repetida →
   409); `PUT /crm/leads/:id/campos-personalizados` — chave desconhecida → 422, tipo
   incompatível → 422, `obrigatorio` ausente → 422, substituição total (chave omitida some),
   delta auditado; `DELETE` de definição em uso → 409; `?campo:<chave>=<v>` filtra
   respeitando o escopo.
7. **Guard**: cada rota de escrita sem token → 401; token sem a permissão → 403 (corpo
   genérico 004); credencial de serviço → 2xx. `converter` sem `pessoa:editar` → 403.
8. **Catálogo**: `GET /admin/rbac/permissoes` inclui `crm_admin:gerir_campos_lead`; as 4
   `lead:*` inalteradas; `GET /auth/permissoes-efetivas` da credencial de serviço contém a
   nova.
9. **Porta**: `RegistrarLeadService.registrar(entrada, { origem:'marketing:meta', idExterno:
   'x1' })` cria; reentrada com a mesma chave → mesmo `leadId`, `criado:false`.
10. **Regressão**: e2e de `auth`/`rbac`/`clientes`/`ingestao`/`crm-admin`/`health` verdes;
    `/health` `contexts.length === 11`.

## Frontend

```bash
cd frontend && npm run test -- leads
npm run dev   # painel em http://localhost:5174  (backend em :3001)
```

Fluxo manual: logar → **CRM · Leads** aparece → **Novo lead** (nome + e-mail) → mover
estágio para `QUALIFICADO` e ver o `score` subir → abrir uma definição de campo
personalizado em **CRM · Administração** (`nicho`, `SELECAO`) → preencher no detalhe do lead
→ **Converter em pessoa** (com `pessoa:editar`) → detalhe mostra o vínculo e `CONVERTIDO`,
lead some da lista padrão.

## Definition of Done

- [ ] `lint` + `typecheck` + `build` verdes; **0** import de `clientes` em `src/crm`.
- [ ] Unit `crm/domain/lead` verdes, incl. matriz `TZ` do scoring.
- [ ] e2e `crm-lead` verdes + regressão 003–007 + `/health` = 11.
- [ ] Frontend `leads` verdes.
- [ ] Catálogo: `crm_admin:gerir_campos_lead` presente; `lead:*` byte-idênticas.
- [ ] `docs/008-crm-lead.md` criado; `CLAUDE.md` / `README.md` / `ROADMAP.md` atualizados.
- [ ] `frontend/src/test/setup.ts` com defaults de `/crm/leads/*` + permissões.
