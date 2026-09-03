# Quickstart — 007 crm-administracao

Guia de validação. Não contém código de implementação — ver `data-model.md` e `contracts/`.

## Pré-requisitos

- Specs 001–006 aplicadas; Postgres dev de pé (host `55432`, `docker compose up -d db`).
- Node 24, `npm ci` na raiz (workspaces `backend`/`frontend`).
- **Nova variável de ambiente** — chave de cifra de segredo de integração (32 bytes base64):

  ```bash
  # exemplo (gera uma chave nova); em CI/teste usa-se uma fixture fixa
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```

  Adicionar a `.env` (e a fixture a `.env.example`, `.github/workflows/ci.yml`,
  `backend/test/setup-db.ts`):

  ```
  CRM_INTEGRACAO_CIFRA_KEY=<44 chars base64 = 32 bytes>
  ```

  Boot **aborta** se ausente ou com tamanho errado (sem default silencioso).

## Migração

```bash
cd backend
npx prisma migrate dev            # aplica <ts>_crm_admin (6 tabelas + 4 enums)
npx prisma generate
```

Confirma no banco: `equipe`, `equipe_membro`, `janela_atendimento`, `feriado`, `integracao`,
`crm_admin_audit` e o índice único **parcial** `equipe_membro_ativo_unico`
(`\d equipe_membro` no psql mostra `... WHERE (saiu_em IS NULL)`).

## Portões estáticos

```bash
# na raiz
npm run lint          # inclui import/no-restricted-paths (crm só importa core/auth) e no process.env fora de config/core
npm run typecheck
npm run build
```

## Unit (sem banco)

```bash
cd backend && npm run test -- crm
```

Cobre: `expediente.spec.ts` (tabela de casos de `contracts/estaEmExpediente.md` — dentro/
fora, borda início/fim, feriado fixo e recorrente, união global+equipe, equipe inativa,
29/02, zero janela → `false`, determinismo N×), `mascarar-segredo.spec.ts`, `api-key.spec.ts`
(formato `crm_`, hash estável), `cifra.spec.ts` (round-trip AES-256-GCM; authTag adulterado
→ erro; IV distinto por chamada).

Matriz de fuso (a CI roda com `TZ` ∈ {UTC, America/Sao_Paulo, Asia/Tokyo}):

```bash
TZ=Asia/Tokyo npm run test -- crm/domain/expediente
```

O veredito de `estaEmExpediente` **não muda** com o `TZ`.

## e2e (Postgres real)

```bash
cd backend && npm run test:e2e -- crm-admin
```

Cenários (resumo — detalhe em `contracts/`):

1. **Migração**: sobe schema isolado, `db seed` não quebra, tabelas + índice parcial presentes.
2. **Equipes**: cria equipe; adiciona membro; 2º vínculo ativo do mesmo par → **409**;
   `usuarioId` inexistente → 404/422; remove membro (`saiu_em` preenchido, some da lista
   ativa, fica no histórico); remover de novo → 204 sem auditoria; `PATCH {ativo:false}`
   some das listas; um usuário em 3 equipes ao mesmo tempo.
3. **Expediente**: `POST` janela `18:00–09:00` → 422 `janela_invalida`; CRUD ok;
   `GET /crm/admin/expediente?instante=<quarta 14:00 BRT>` → `emExpediente:true`; com feriado
   nesse dia → `false`; `instante=lixo` → 400; união global + janela de equipe conferida.
4. **Integrações**: `POST WEBHOOK {segredo:'s3cr3t'}` → resposta traz `segredoMascarado`,
   nunca `s3cr3t`; `GET` idem; `POST {tipo:'API_KEY'}` sem segredo → `apiKey:'crm_…'` na
   resposta de criação, **ausente** no `GET` seguinte; `POST …/rotacionar` → novo valor 1×,
   hash antigo não valida mais; `PATCH {nome}` preserva segredo; `rotacionar` de
   `CONEXAO_INTERNA` sem segredo → 409. **Asserção-chave**: `grep` do valor do segredo em
   TODAS as respostas + em `crm_admin_audit` + nos logs capturados = **0 ocorrências**.
5. **Auditoria**: cada escrita → 1 `crm_admin_audit` (autor = sub do JWT / credencial de
   serviço, `quando`, `entidade`, `campo`, `delta`, `origem='AJUSTE_MANUAL'`); `PATCH` no-op
   → 0 registro; criação/rotação de segredo → registro com `{segredo:'definido'|'rotacionado'}`,
   sem valor.
6. **Guard**: cada rota sem token → 401; token de `Usuario` sem perfil → 403 (corpo genérico
   004); credencial de serviço → 2xx.
7. **Catálogo**: `GET /admin/rbac/permissoes` lista o recurso `crm_admin` com 4 permissões;
   `GET /auth/permissoes-efetivas` da credencial de serviço as contém.
8. **Regressão**: e2e de `auth`/`rbac`/`clientes`/`ingestao`/`health` verdes; `/health`
   `contexts.length === 11`.

## Frontend

```bash
cd frontend && npm run test -- crm-admin
npm run dev   # painel em http://localhost:5174  (backend em :3001)
```

Fluxo manual: logar → **CRM · Administração** aparece → aba Equipes cria "Comercial – Alto
Ticket" + adiciona um usuário → aba Expediente cria janela seg–sex 09:00–18:00 e o
indicador "no expediente agora?" reflete → aba Integrações cria uma `API_KEY`, copia o valor
revelado, recarrega a página e confirma que **só a máscara** permanece.

## Definition of Done

- [ ] `lint` + `typecheck` + `build` verdes.
- [ ] Unit `crm` verdes, incl. matriz `TZ`.
- [ ] e2e `crm-admin` verdes + regressão 003–006 + `/health` = 11.
- [ ] Frontend `crm-admin` verdes.
- [ ] `grep` de segredo em respostas/audit/log = 0.
- [ ] `docs/007-crm-administracao.md` criado; `CLAUDE.md` / `README.md` / `ROADMAP.md`
      atualizados.
- [ ] `.env.example` / `ci.yml` / `setup-db.ts` com a fixture de `CRM_INTEGRACAO_CIFRA_KEY`.
