# Quickstart — Validação da spec 004 (RBAC)

Roteiro para provar a fatia ponta a ponta. Sem implementação — só como rodar e o que
esperar. Detalhes de forma nos `contracts/` e `data-model.md`.

## Pré-requisitos

- Node 24, workspaces instalados (`npm ci` na raiz).
- Postgres de dev/teste de pé: `npm run db:up` (Postgres dev host `55432`, sem porta nova).
- `.env` na raiz com as chaves das specs 001–003 (nada novo nesta spec). O
  `SERVICE_CLIENT_ID` é o `sub` que resolve para o perfil `administrador`.

## 1. Migração + seed (primeira migração de negócio do projeto)

```bash
npm run prisma:migrate:dev --workspace backend      # cria migrations/<ts>_rbac + roda o seed
```

Esperado: 5 tabelas criadas (`usuario`, `perfil`, `perfil_permissao`, `usuario_perfil`,
`rbac_audit`); `prisma/seed.ts` cria o perfil de sistema **Administrador** (idempotente —
rodar de novo não duplica). `npm run prisma:reset --workspace backend` recria + re-semeia.

## 2. Portões estáticos (raiz)

```bash
npm run lint
npm run typecheck
npm run build
```

Esperado: verde. `no-restricted-syntax` (sem `process.env` fora de `config/`/`core/`/
`main.ts`) e `import/no-restricted-paths` (`auth` não importa contexto de domínio) seguem
válidos.

## 3. Unit — backend (sem banco)

```bash
npm test --workspace backend
```

Cobre (novos):
- `catalogo.spec` — ids únicos, formato `recurso:acao`, `assertCatalogoCoerente()` aborta
  em id duplicado.
- `resolver-permissoes.spec` — união de perfis; conjunto vazio; perfil `administrador` →
  catálogo inteiro; permissão fora do catálogo é descartada.
- `calcular-delta.spec` — add/remove/no-op (`null`).
- `permission.guard.spec` — matriz de `contracts/permission-guard.md` (sem marcador → 403;
  `@AutenticadoBasta` → ok; `@RequerPermissao` E parcial → 403; credencial de serviço → ok).

## 4. Unit — frontend (jsdom)

```bash
npm test --workspace frontend
```

Cobre `contracts/frontend-rbac.md`: `RequirePermissao` (tem/não tem/403 → tela "sem
permissão", nunca `/login`), navegação condicional, `apiFetch` 403 (token intacto, sem
navegação) vs 401 (fluxo da 003 intacto), `PerfisTab` (checklist agrupado, sistema
read-only), `UsuariosTab` (criar + multi-select).

## 5. e2e — backend (Postgres real, schema isolado + seed)

```bash
npm run test:e2e --workspace backend
```

`test/setup-db.ts` passa a rodar `prisma db seed` após `migrate deploy`. Cobre:
- `rbac.e2e-spec.ts` — guard 401/403/200 com rotas-isca (`@RequerPermissao`,
  `@AutenticadoBasta`, **sem marcador → 403**); `GET /admin/rbac/permissoes` 200/403;
  `GET /auth/permissoes-efetivas` 200 (serviço → catálogo; `Usuario` sem perfil → `[]`);
  CRUD de perfil + `rbac_audit` (1 registro/ação, **0** em no-op); `administrador` imutável
  → 409; apagar perfil em uso → 409; `POST /usuarios` (409 e-mail repetido);
  `PUT /usuarios/{id}/perfis` (união, `[]`, perfil inexistente → 404); seed idempotente
  (rodar 2× → 1 `administrador`); anti-_lockout_ (nenhuma sequência zera `perfil:administrar`).
- **Regressão**: `auth.e2e-spec.ts`, `health.e2e-spec.ts`, `context-modules.e2e-spec.ts`
  (ainda **11** contextos) verdes sem alteração.

Helper novo: `test/support/auth.ts` ganha `issueUserToken(usuarioId)` (JWT com `sub` =
id de `Usuario`, para exercitar sujeito não-admin).

## 6. Fluxo manual no painel

```bash
npm run start:dev --workspace backend      # :3001
npm run dev --workspace frontend           # :5174
```

1. Login com `SERVICE_CLIENT_ID`/`SERVICE_CLIENT_SECRET` → shell. O menu mostra
   **Administração** (a credencial de serviço é `administrador`).
2. **Administração › Perfis**: criar "Comercial" marcando `lead:criar`, `lead:editar`,
   `lead:ver_proprios` (checklist agrupado por recurso). Salvar.
3. Abrir o perfil **Administrador** → controles desabilitados, selo "perfil de sistema".
4. **Administração › Usuários**: criar "Ana" (`ana@exemplo.com`), atribuir "Comercial".
5. Conferir no banco: `select * from rbac_audit order by quando;` → um registro por ação
   (criar perfil, criar usuário, atribuir perfis), com `autor` = `SERVICE_CLIENT_ID`.
6. Salvar o perfil "Comercial" sem mudar nada → **nenhum** novo `rbac_audit`.
7. Tentar `DELETE` do perfil "Comercial" enquanto Ana o tem → 409 "perfil em uso".

## 7. CI

`.github/workflows/ci.yml` (job e2e) ganha `npx prisma migrate deploy && npx prisma db seed`
antes dos testes. Nenhuma env nova. Jobs `build-test` e `timezone-matrix` seguem verdes.

## Definition of Done (além dos testes)

- [ ] `docs/004-rbac.md` escrito (catálogo, perfis de sistema, guard/decorators, resolução
      por requisição, tabelas, seed, painel).
- [ ] `CLAUDE.md` (stack: bloco RBAC + "Plano ativo" → 004), `README.md` (nota de migração
      + seed no "Como rodar"), `ROADMAP.md` (004 marcada ✅) atualizados.
- [ ] `netstat`/`docker ps` conferido: nenhuma porta nova (3001/5174/55432 já do projeto).
- [ ] `context-modules.e2e-spec.ts` ainda afirma **11** contextos.
