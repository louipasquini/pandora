# Phase 0 — Research: RBAC (spec 004)

Todas as decisões de arquitetura vinculantes (CL-01/02/03 + criação de `usuario` + abas do
painel) já foram resolvidas com o dono do produto e estão em `spec.md §Clarifications`.
Este documento registra as decisões **técnicas** derivadas — nenhuma delas depende do dono
do produto; são escolhas de implementação dentro do que a spec e a constituição fixam.

## D1 — Catálogo de permissões: array congelado em código, não tabela

**Decisão**: `PERMISSOES` é um `readonly` array de objetos
`{ id: 'recurso:acao', recurso, rotulo }` em `src/auth/rbac/catalogo.ts`, com
`Object.freeze`. O tipo `Permissao` é `(typeof PERMISSOES)[number]['id']` (união literal).
`assertCatalogoCoerente()` roda no boot (`AuthModule` `onModuleInit`, puro, sem banco):
ids únicos e todo `@RequerPermissao('x')` registrado casa um id — senão `throw` (aborta).

**Racional**: FR-001 exige "fonte única, não editável em runtime, versionada em _diff_".
Uma tabela `permissao` seria estado mutável que pode divergir do código que a checa; o
catálogo precisa acompanhar cada spec que adiciona um recurso (é código, revisado em PR).
`perfil_permissao` guarda **strings** validadas contra o catálogo, não FK para uma tabela
`permissao` — permissão órfã (removida do catálogo) é ignorada na resolução e sinalizada
"desconhecida" na leitura (Princípio VII, sem apagar o registro).

**Alternativas rejeitadas**:
- Tabela `permissao` + FK: adiciona migração e seed a cada spec de recurso, e o risco de
  FK apontar para linha que o código não conhece mais. Sem ganho — ninguém edita permissão
  em runtime por design.
- Enum TypeScript: perde `recurso`/`rotulo` (o painel precisa deles para agrupar) e obriga
  um mapa paralelo.

## D2 — `PermissionGuard` como 2º `APP_GUARD`, depois do `JwtAuthGuard`

**Decisão**: registrar no `AuthModule` `providers` **nesta ordem**:
`{ provide: APP_GUARD, useClass: JwtAuthGuard }` e depois
`{ provide: APP_GUARD, useClass: PermissionGuard }`. O NestJS executa `APP_GUARD`s na
ordem de declaração; o `PermissionGuard` lê `req.auth` (posto pelo `JwtAuthGuard`).

**Comportamento do `PermissionGuard.canActivate`**:
1. `@Public()` (handler/classe) **ou** `ehRotaPublicaPorPath(req.path)` → `true` (não é
   assunto de permissão; o `JwtAuthGuard` já liberou).
2. `req.auth` ausente → `true` (defensivo: só acontece se o guard de JWT liberou por rota
   pública mas o path não casou o allowlist — não deve ocorrer; nunca **concede** acesso a
   rota protegida sem `auth` porque o passo 5 exige permissão).
3. `@AutenticadoBasta()` presente → `true`.
4. `@RequerPermissao(...perms)` presente → resolve `Set` de permissões efetivas do sujeito
   (D4); `perms.every(p => set.has(p))` → `true`, senão `ForbiddenException` genérica.
5. **Nenhum marcador** e rota não-pública → `ForbiddenException` (CL-03, fechado por
   omissão). Log `warn` com rota + `motivo=sem-marcador-rbac`.

**Boot check opcional (FR-023 "MAY")**: um `RbacRouteAudit` em `onApplicationBootstrap`
varre `DiscoveryService` + `MetadataScanner` por handlers HTTP sem `@Public`/
`@AutenticadoBasta`/`@RequerPermissao` e loga a lista (não aborta na v1 — evita brigar com
libs que registram rotas; vira `error` de boot numa spec futura se o time quiser).

**Racional**: dois guards pequenos e explícitos > um guard gigante. Reaproveita todo o
maquinário de `@Public()`/allowlist da 003 sem tocá-lo. `ForbiddenException` do Nest já
produz `{ statusCode: 403, error: 'Forbidden', message }` — basta passar `'permissão
insuficiente'` e **não** incluir a permissão que faltou (SC-005).

**Alternativas rejeitadas**:
- Fundir no `JwtAuthGuard`: mistura autenticação com autorização, dificulta testar cada
  uma, e complica o "rota sem token → 401 antes de 403".
- `CASL`/`accesscontrol`/`nest-access-control`: peso desproporcional para uma matriz plana
  (sem condições por atributo, sem herança, sem regras de negação — spec §Assumptions).
  Reavaliar só se ABAC entrar no escopo.

## D3 — `NotFoundAuthFilter` (003) fica como está

**Decisão**: não mexer no filtro que converte 404→401 para caminho inexistente sem token.
Ele roda antes de qualquer `PermissionGuard` (é `APP_FILTER` sobre `NotFoundException`,
para rota **não casada**). Rota casada mas sem permissão → o `PermissionGuard` responde
403 normalmente. Não há interação: 401 (sem token / rota fantasma) e 403 (token ok, sem
permissão) permanecem ortogonais.

## D4 — Resolução de permissões efetivas: por requisição, com special-case do admin

**Decisão**: `SujeitoRbacService.permissoesDe(req): Promise<ReadonlySet<Permissao>>`:
- memoiza em `req.rbac.permissoes` (uma vez por requisição).
- `sub = req.auth.sub`. Se `sub === config.SERVICE_CLIENT_ID` (ou o `sub` fixo do token de
  serviço) → retorna `new Set(PERMISSOES.map(p => p.id))` **direto do catálogo em código**
  (o perfil `administrador`). Não consulta o banco.
- senão: `rbacRepository.perfisDoUsuario(sub)` → se algum perfil é o `administrador`
  (`de_sistema`, id fixo) → catálogo inteiro; senão `resolverPermissoesEfetivas(perfis)` =
  união de `perfil_permissao`, permissões fora do catálogo descartadas.
- `sub` que não casa nenhum `Usuario` → `Set` vazio.

**Racional**: CL-02 (por requisição, sem _staleness_). O special-case do admin cumpre
FR-007/FR-024 de forma **robusta**: "administrador inclui permissões de specs futuras sem
intervenção manual" vale mesmo que o seed ainda não tenha rodado para adicionar a linha
nova em `perfil_permissao`. O seed continua criando a linha (para a UI listar o perfil
completo), mas a **decisão de autorização** não depende de ela estar fresca. Uma linha
`administrador` ausente no banco também não abre nem fecha acesso indevidamente.

**Alternativas rejeitadas**:
- _Claim_ no JWT (CL-02 opção B): rejeitada pelo dono do produto (janela de _staleness_ de
  até 12 h).
- `administrador` como linhas normais em `perfil_permissao`, sem special-case: exige o seed
  rodar após **toda** spec que adiciona permissão, senão o admin "perde" acesso novo
  silenciosamente. Frágil.
- Cache entre requisições (Redis/in-memory TTL): _staleness_ de novo, e Redis é porta/infra
  nova (proibido). A query é barata e rara (só telas de admin + o 1º hit de cada request
  protegido por permissão não-`@AutenticadoBasta`).

## D5 — Seed do perfil de sistema: `prisma/seed.ts` idempotente

**Decisão**: `backend/prisma/seed.ts` (rodado por `ts-node`, já em devDeps) faz `upsert`
do perfil `administrador` (`id` fixo `PERFIL_ADMIN_ID`, `deSistema: true`, `nomeNormalizado
= 'administrador'`) e sincroniza `perfil_permissao` com o catálogo atual (deleta as que
saíram, insere as que entraram). `package.json` ganha
`"prisma": { "seed": "ts-node prisma/seed.ts" }` — assim `prisma migrate dev` e
`prisma migrate reset` rodam o seed automaticamente. `test/setup-db.ts` ganha um
`execFileSync('npx', ['prisma', 'db', 'seed'], ...)` logo após o `migrate deploy`. O
`ci.yml` (job e2e) ganha o mesmo passo.

**Boot (FR-035/FR-036)**: `AuthModule.onModuleInit` roda `assertCatalogoCoerente()` (puro,
**aborta** em inconsistência de catálogo) e loga uma linha
`rbac.ready permissoes=<n> perfis_sistema=<n>`. A **existência** do `administrador` no
banco é responsabilidade do pipeline migração+seed (roda em todo ambiente); o runtime não
depende dela para decidir (D4). Se o banco estiver **fora** no boot, o comportamento da
001/003 é preservado (app sobe, `/health` reporta `db: down`) — não transformamos "banco
indisponível" em falha de boot.

**Alternativas rejeitadas**:
- `OnApplicationBootstrap` que cria o perfil: precisa de banco no boot; ou aborta (regride
  a tolerância a "db down" da 001) ou engole erro (então por que ter). `prisma/seed.ts` é o
  caminho idiomático e roda nos 3 ambientes.
- Migração SQL com `INSERT` do perfil: some da migração se o catálogo mudar; migração
  deveria ser estrutura, não dado semântico que evolui.

## D6 — E-mail e nome de perfil únicos sem `citext`

**Decisão**: cada um guarda duas colunas — a forma original (`email`, `nome`) e a
normalizada (`emailNormalizado`, `nomeNormalizado` = `trim().toLowerCase()`), com `@unique`
na normalizada. A aplicação calcula a forma normalizada ao escrever.

**Racional**: evita habilitar a extensão `citext` no Postgres (mudança de infra, e o
harness de teste cria schema isolado — extensão por schema é chato). Determinístico e
testável sem banco. FR-006 ("nome único _case-insensitive_, _trimmed_") e FR-014 ("e-mail
único, normalizado") ficam satisfeitos.

**Alternativas rejeitadas**: `citext` (infra), índice funcional `LOWER(email)` (Prisma 6
suporta via `@@index`/`@@unique` com expressão só em preview; evitar preview features).

## D7 — `RbacAudit`: forma canônica do core, `Json` no `delta`, append-only

**Decisão**: tabela `rbac_audit` com colunas alinhadas a `RegistroAuditoria`
(`autor`, `quando @db.Timestamptz`, `entidade`, `entidadeId`, `campo`, `valorAnterior
Json?`, `valorNovo Json?`, `motivo`, `origem`) + `id` UUID v7 + `criadoEm`.
`RbacAuditService.registrar()` chama `montarRegistroAuditoria({ ..., origem:
OrigemMudanca.AJUSTE_MANUAL })` (valida `motivo` não-vazio, `origem` no enum) e faz um
`INSERT`. Nenhum `UPDATE`/`DELETE` no código (FR-027). `calcularDelta(antes, depois)`
devolve `{ adicionadas, removidas }` ou `null` (no-op → **não** grava, FR-026).

**`autor`**: `req.auth.sub`. Enquanto só existe a credencial de serviço, todo registro fica
com o `sub` dela — aceitável e honesto (a atribuição individual chega com o login de
equipe; a spec 053 e a futura spec de login refinam). Nunca gravamos segredo/token.

**Ações auditadas** (7): `perfil.criado`, `perfil.renomeado`, `perfil.permissoes_alteradas`,
`perfil.apagado`, `usuario.criado`, `usuario.perfis_alterados` (um registro com o _delta_
de perfis), — e `usuario.perfil_removido`/`adicionado` são expressos como o mesmo
`usuario.perfis_alterados` com listas antes/depois (mais simples que N registros).

## D8 — Frontend: `RequirePermissao` consome o catálogo/efetivas via endpoint

**Decisão**: um hook `usePermissoesEfetivas()` (TanStack Query) chama
`GET /admin/rbac/permissoes` — que, além do catálogo, devolve `efetivas: string[]` (as
permissões do **sujeito atual**, resolvidas no backend). `RequirePermissao perm="..."`:
`isLoading` → _spinner_; sucesso e `efetivas.includes(perm)` → `children`; 403 ou
`!includes` → tela "sem permissão". `AppShell` filtra `NAV_ITEMS` por `efetivas`.
`apiFetch` ganha `setForbiddenHandler` — um 403 dispara um banner "sem permissão" via
`AuthProvider`, **sem** limpar token nem `queryClient.clear()` (isso é só do 401).

**Dois _endpoints_ de leitura** (separação por permissão exigida):
- `GET /admin/rbac/permissoes` — o **catálogo** completo agrupado por recurso. Exige
  `@RequerPermissao('perfil:administrar')` (só a tela de admin monta o checklist).
- `GET /auth/permissoes-efetivas` — só os `string[]` das permissões do **sujeito atual**.
  `@AutenticadoBasta()` — qualquer autenticado, para o `AppShell`/`RequirePermissao`
  decidirem navegação e gate de rota sem precisar ser admin.

**Racional**: FR-034 (zero permissão _hardcoded_ no bundle) e FR-029/FR-032. Como hoje o
sujeito é sempre o `administrador`, `/auth/permissoes-efetivas` devolve o catálogo inteiro;
o gate já funciona para quando houver login individual.

**Alternativas rejeitadas**: decodificar permissões do JWT no cliente (o JWT é fino por
CL-02 — não as carrega); um só _endpoint_ servindo catálogo + efetivas (obrigaria o gate
de UI a exigir `perfil:administrar`, quebrando o caso de um usuário não-admin no futuro).

## D9 — Sem dependência nova

Confirmado: `@nestjs/jwt`, `zod`, Prisma, `@prisma/client`, `ts-node` já estão no
`backend/package.json`. Frontend não precisa de nada. `package.json` do backend muda só
para adicionar o bloco `"prisma": { "seed": ... }`.

## D10 — Portas

`netstat` na máquina do dono: 3001 (backend), 5174 (frontend) e 55432 (Postgres dev) já
estão **em uso pelo próprio projeto**. Esta spec não abre serviço novo, não usa Redis nem
fila. Nenhuma porta nova.
