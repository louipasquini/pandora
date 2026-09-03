# Quickstart — Validação da spec 005 (pessoa e conta)

Roteiro para provar a fatia ponta a ponta. Sem implementação — só como rodar e o que
esperar. Detalhes de forma nos `contracts/` e `data-model.md`.

## Pré-requisitos

- Node 24, workspaces instalados (`npm ci` na raiz).
- Postgres de dev/teste de pé: `npm run db:up` (Postgres dev host `55432`, **sem porta
  nova** — reusa `DATABASE_URL`/`TEST_DATABASE_URL`).
- `.env` na raiz com as chaves das specs 001–004 (nada novo nesta spec).

## 1. Migração (2ª migração de negócio do projeto)

```bash
npm run prisma:migrate:dev --workspace backend      # cria migrations/<ts>_clientes
```

Esperado: ~11 tabelas criadas (`pessoa`, `conta`, `pessoa_email`, `pessoa_telefone`,
`pessoa_documento`, `pessoa_endereco`, `pessoa_origem_ref`, `merge_pessoa`, `merge_conta`,
`nota_reconciliacao`, `clientes_audit`). **Sem seed de negócio** — `prisma db seed` (o da
004) roda e não quebra (só mexe em RBAC). `npm run prisma:reset --workspace backend`
recria.

## 2. Portões estáticos (raiz)

```bash
npm run lint
npm run typecheck
npm run build
```

Esperado: verde. `import/no-restricted-paths` — `clientes` importa só de `core` e `auth`
(infra transversal); **não** importa `contratos`/`financeiro`/`crm`. `no-restricted-syntax`
— sem `process.env` fora de `config/`/`core/`.

## 3. Unit — backend (sem banco)

```bash
npm test --workspace backend
```

Cobre (novos):
- `domain/documento.spec` — DV de CPF/CNPJ (válido, inválido, repetido `111...`), máscara,
  classificação por nº de dígitos.
- `domain/normalizar.spec` — e-mail (`case`/`trim`, `+tag` **mantido**), telefone (com/sem
  DDI, lixo → descartada), documento.
- `domain/resolver-identidade.spec` — matriz de `contracts/engine-identidade.md` §Unit
  (ordem, ambiguidade descarta critério, determinismo N×, segue `mergedPara`).
- `domain/merge-plano.spec` — plano de merge (secundários, proveniência); plano de reversão
  limpo; reversão com item `curado` depois → mantém atual + nota; reversão fora de ordem
  (merge A, merge B, desfaz A) → só linhas de A.

## 4. Unit — frontend (jsdom)

```bash
npm test --workspace frontend
```

Cobre `contracts/frontend-pessoas-contas.md`: nav condicional (`pessoa:ver`/`conta:ver`),
`RequirePermissao` → `SemPermissao` (nunca Login), detalhe (primário/secundário/curado),
403 numa chamada → banner + token intacto, pessoa `merged` → banner de unificação, busca
casa e-mail secundário, controles de escrita só com `*:editar`/`*:merge`.

`frontend/src/test/setup.ts`: o `fetch` default ganha resposta para `/pessoas` e `/contas`
(lista vazia) além do `/auth/permissoes-efetivas` já existente.

## 5. e2e — backend (Postgres real, schema isolado)

```bash
npm run test:e2e --workspace backend
```

`test/setup-db.ts` já roda `migrate deploy` + `db seed` — a migração nova entra sozinha.
`clientes.e2e-spec.ts` cobre:
- **CRUD `pessoa`**: `POST` (201 + `clientes_audit`; 400 DV inválido; 409 contato de
  outra); `PATCH` (define primário → `curado` + delta; 409 unicidade; 400 remove última
  âncora); sem `DELETE`.
- **`resolverOuCriar`** (via provider do `ClientesModule` no teste, não endpoint): cria +
  refs; rotaciona; idempotente (3×); primário curado → secundário + `nota_reconciliacao`;
  `criar:false` sem match → `null` (afiliada).
- **merge/desfazer `pessoa`**: secundários + `mergedPara` + `merge_pessoa` (snapshot) +
  `clientes_audit`; `GET` da absorvida resolve p/ sobrevivente; merge encadeado + desfazer
  do **primeiro** (fora de ordem) → recria absorvida, 2º merge íntegro; desfazer 2× → 409;
  item curado antes do desfazer → `nota_reconciliacao` `divergiu_pos_merge`; merge inválido
  → 400/404/409.
- **`conta`**: CRUD; associar (409 se já em outra); desassociar; `merge_conta` + desfazer;
  `grep` do módulo `clientes` por `contrato` → 0 ocorrência efetiva (SC-012).
- **guard**: `GET /pessoas` sem token → 401; token de `Usuario` sem perfil → 403;
  credencial de serviço → 200; `Usuario` com `{pessoa:ver, pessoa:editar}` → `POST` 201.
- **Regressão**: `auth.e2e-spec.ts`, `rbac.e2e-spec.ts`, `health.e2e-spec.ts`,
  `context-modules.e2e-spec.ts` (ainda **11** contextos) verdes sem alteração.

Helper novo: `test/support/clientes.ts` (criar pessoa/conta via API; semear fixtures de
dedup — pessoas com documento/e-mail/telefone controlados).

## 6. Fluxo manual no painel

```bash
npm run start:dev --workspace backend      # :3001
npm run dev --workspace frontend           # :5174
```

1. Login com `SERVICE_CLIENT_ID`/`SERVICE_CLIENT_SECRET` → o menu mostra **Pessoas** e
   **Contas** (a credencial de serviço concede tudo).
2. **Pessoas › Nova pessoa**: "Maria Souza", CPF `529.982.247-25` (DV válido), e-mail
   `maria@exemplo.com`. Salvar → detalhe com e-mail primário `curado`.
3. **Editar**: adicionar `maria2@exemplo.com`, marcar como primário → o antigo vira
   secundário com data; ambos `curado`.
4. Criar uma 2ª "Maria Souza" só com o telefone `11 98888-0000`. Nas duas telas de
   detalhe, **Unificar**: sobrevivente = a 1ª. O telefone entra como secundário; a 2ª
   redireciona para a 1ª com o banner de unificação.
5. **Desfazer** o merge na linha do tempo → as duas voltam. `select * from
   nota_reconciliacao;` → vazio (nada foi curado no meio).
6. **Contas › Nova conta** "Família Souza" (HOUSEHOLD); adicionar a Maria. `select * from
   clientes_audit order by quando;` → um registro por ação (criar pessoa, editar, merge,
   desfazer, criar conta, associar), `autor` = `SERVICE_CLIENT_ID`.
7. `select id from contrato;` → a tabela nem é referenciada pelo módulo (SC-012).

## 7. CI

`.github/workflows/ci.yml` — **sem mudança**: o passo `migrate deploy` já aplica a migração
nova; o `db seed` da 004 cobre o RBAC (que ganhou 6 permissões no catálogo, sem migração de
dados). Jobs `build-test` e `timezone-matrix` seguem verdes.

## Definition of Done (além dos testes)

- [ ] `docs/005-pessoa-identidade-dedup.md` escrito (pessoa/conta, engine, normalização,
      merge reversível, curadoria vs derivação, tabelas, painel).
- [ ] `CLAUDE.md` (bloco `clientes` no "Stack" + "Plano ativo" → 005), `README.md` (nota da
      2ª migração), `ROADMAP.md` (005 marcada ✅) atualizados.
- [ ] `netstat`/`docker ps` conferido: nenhuma porta nova (3001/5174/55432 já do projeto).
- [ ] `context-modules.e2e-spec.ts` ainda afirma **11** contextos; `/health` idem.
- [ ] Catálogo RBAC com `pessoa:*` e `conta:*`; suíte da 004 verde sem alteração.
