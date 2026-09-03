# Phase 0 — Research: Autenticação de serviço JWT

Todas as decisões abaixo estão fechadas. Nenhum `NEEDS CLARIFICATION` permanece (CL-01 e
CL-02 resolvidos com o dono do produto — ver `spec.md` §Clarifications).

---

## D1 — Biblioteca de assinatura/verificação de JWT

**Decisão**: `@nestjs/jwt` `^11` (wrapper oficial NestJS sobre `jsonwebtoken@9`). HS256 com
segredo simétrico de `SERVICE_JWT_SECRET`.

**Rationale**:
- Não se deve hand-rollar JWT: erros de comparação de assinatura, de _parsing_ de `alg`
  (ataque `alg:none`), e de validação de `exp`/`nbf` são clássicos e custam caro.
- `@nestjs/jwt` integra com DI (`JwtModule.registerAsync` lê o segredo do `ConfigService`,
  respeitando a regra ESLint `no-process-env`), expõe `signAsync`/`verifyAsync` com
  `issuer`, `expiresIn` e `clockTolerance` prontos, e trava o algoritmo (`algorithms:
  ['HS256']` na verificação — nunca aceitar `none`).
- É uma dependência, transitivamente `jsonwebtoken`, amplamente auditada.

**Alternativas consideradas**:
- **`jose`** — excelente, mas voltada a JOSE completo (JWK/JWE); overkill para HS256 com um
  segredo. Sem integração NestJS.
- **`node:crypto` na mão** (HMAC-SHA256 + base64url) — zero dep, mas reintroduz exatamente
  o risco que a lib elimina; rejeitado.
- **`@nestjs/passport` + `passport-jwt`** — traz o modelo de _strategies_ do Passport,
  peso e indireção desnecessários para um único tipo de credencial e um único nível de
  acesso. O guard próprio (~40 linhas) é mais legível e a spec 004 (RBAC) vai estendê-lo
  de qualquer forma.

**Impacto**: +1 dep de runtime no `backend/package.json`. Registrada no Constitution Check.

---

## D2 — Formato e teto de `SERVICE_JWT_TTL`

**Decisão**: string compacta `<n>[s|m|h|d]` (ex.: `12h`, `43200s`, `1d`), default `12h`.
No `env.schema`, um `.transform` converte para **segundos** e um `.refine` rejeita
`> 86400` (24 h) — valor acima do teto **aborta o boot** nomeando `SERVICE_JWT_TTL`.
O valor em segundos é o que vai para `expiresIn` do `signAsync`.

**Rationale**:
- Forma compacta é a convenção do `jsonwebtoken`/`ms`, legível no `.env` (`12h` > `43200`).
- Converter para segundos no schema deixa o teto **verificável de forma determinística** e
  livre da semântica de `ms` em runtime; o resto do código lida só com `number`.
- Teto rígido de 24 h materializa "expiração curta" da spec e impede um `.env` de produção
  de, por engano, emitir tokens de 30 dias.

**Alternativas**: aceitar só inteiro de segundos (menos legível); não ter teto (rejeitado —
contraria FR-005); teto configurável (YAGNI).

---

## D3 — _Rate limiting_ de `POST /auth/token`

**Decisão**: guard **in-house** de janela fixa em memória
(`guards/rate-limit.guard.ts`), aplicado **só** no `AuthController`. Chave = IP de origem
(`req.ip`, com `app.set('trust proxy', 1)` no `main.ts` para respeitar `X-Forwarded-For`
atrás de proxy). Janela e limite por env com default (`RATE_LIMIT_WINDOW_MS=60000`,
`RATE_LIMIT_MAX=10`). Excedeu → `429` com header `Retry-After`.

**Rationale**:
- A spec pede _rate limiting_ **leve** e explicitamente joga _lockout_ progressivo e a
  proteção robusta para a **spec 055 (hardening)**, que vai escolher a infra (provável
  store compartilhado / Redis).
- Um guard de ~40 linhas, testável sem banco e sem dep, cobre "barrar força bruta trivial"
  sem comprometer a escolha de infra da 055.
- `@nestjs/throttler` seria o caminho idiomático, mas: (a) seu store default é memória por
  instância (não serve produção multi-nó — a 055 teria de trocar mesmo), (b) fazê-lo
  global exigiria `@SkipThrottle` espalhado ou config fina para não afetar as outras
  rotas. Adia-se a dep para quando a 055 decidir o store.

**Alternativas**: `@nestjs/throttler` agora (adiado — ver acima); nenhum _rate limiting_
(rejeitado — FR-007a); _lockout_ por conta (fora de escopo — 055).

**Nota**: o guard NÃO conta como "endpoint de escrita" nem como estado mutável de domínio
— é contador efêmero de proteção, reiniciado a cada restart. Sem persistência.

---

## D4 — Allowlist de rotas públicas

**Decisão**: duas camadas, ambas explícitas e revisáveis em diff:
1. **`@Public()`** (decorator `SetMetadata(IS_PUBLIC_KEY, true)`) nos handlers:
   `HealthController.check` e `AuthController.token`. O `JwtAuthGuard` consulta o
   `Reflector` (handler **e** classe) e, se público, retorna `true` sem olhar o header.
2. **Prefixo de path** em `guards/public-routes.ts`:
   `PUBLIC_PATH_PREFIXES = ['/webhooks/']`. O guard isenta qualquer requisição cujo
   `req.path` comece com um prefixo da lista. Serve para as rotas de webhook das specs
   019–022 já nascerem fora do JWT (elas terão a sua própria checagem via
   `WebhookAuthenticator`), sem precisar tocar neste arquivo de novo.

**Rationale**:
- `@Public()` é o mecanismo fino, por handler, para casos pontuais (`/health`, o próprio
  emissor de token).
- O prefixo `/webhooks/` é uma decisão de arquitetura já tomada na spec (FR-010) e
  registrá-la como constante nomeada, com comentário, é mais honesto que espalhar
  `@Public()` em cada controller de adapter depois. Continua sendo "um ato explícito e
  revisável" (FR-011): mexer na lista é um diff nítido.
- Uma rota **sem** `@Public()` e **fora** dos prefixos é protegida — o default é fechado
  (FR-011, SC-003).

**Alternativas**: só `@Public()` (obrigaria cada adapter a lembrar de marcar — frágil); só
allowlist de paths central (perde a granularidade por handler); config em `.env` (allowlist
é código, não configuração de ambiente — rejeitado).

---

## D5 — Comparação de credenciais e de token de webhook em tempo constante

**Decisão**: `node:crypto.timingSafeEqual` sobre `Buffer.from(a)` / `Buffer.from(b)`, com
**guarda de comprimento** antes (comprimentos diferentes → `timingSafeEqual` lança;
retornar `false` sem comparar, mas depois de tocar um `Buffer` de mesmo tamanho para não
vazar o tamanho por _timing_ grosseiro). Encapsulado em `crypto`-helper
`comparacaoConstante(a: string, b: string): boolean` em `auth/`.

**Rationale**: evita _timing oracle_ tanto no `client_secret` quanto no
`<PLATAFORMA>_WEBHOOK_TOKEN`. `timingSafeEqual` é a primitiva correta do runtime; o
wrapper padroniza o tratamento de comprimento e é testável.

**Alternativas**: `===` (vulnerável a _timing_ — rejeitado); HMAC dos dois lados e comparar
digests (bom, mas `timingSafeEqual` direto já basta para segredos deste porte).

---

## D6 — CORS

**Decisão**: `app.enableCors({ origin: config.get('CORS_ORIGIN'), credentials: false })` no
`main.ts`. `CORS_ORIGIN` é env **opcional**, default `http://localhost:5174`. Só
`Authorization` e `Content-Type` nos _allowed headers_; métodos `GET,POST,PATCH,PUT,DELETE`.

**Rationale**: o painel (`:5174`) chama o backend (`:3001`) — origem cruzada; sem CORS o
navegador bloqueia o `POST /auth/token`. `credentials: false` porque o token vai no header
`Authorization`, não em cookie (não há cookie nesta arquitetura). Origem única
configurável evita `*` (que, mesmo sem credenciais, é bom evitar numa API interna).

**Alternativas**: proxy do Vite para `/api` (esconde o CORS, mas acopla o dev-server à
rota e não vale em produção); `origin: true` (reflete qualquer origem — rejeitado).

---

## D7 — Armazenamento do token no painel (CL-02 = `localStorage`)

**Decisão**: `localStorage`, chave `pandora.token`. Leitura na inicialização do
`AuthProvider`; se o `exp` decodificado já passou, descarta e trata como deslogado. Toda
leitura/escrita/remoção passa por `token-storage.ts`, embrulhada em `try/catch`: se
`localStorage` lançar (aba privada restrita, storage desabilitado), cai para uma variável
de módulo em memória e liga um flag `persistente=false` que a UI usa para avisar "o login
não vai persistir entre abas/reinícios".

**Rationale**: decisão do dono do produto (CL-02) — menor atrito para um painel interno de
nível único usado o dia todo. Exposição a XSS é aceita nesta fase; reavaliar armazenamento
(cookie `HttpOnly` + CSRF, ou memória + _silent refresh_) é escopo declarado da **spec
055**. O _fallback_ em memória garante que o painel nunca quebra por storage indisponível
(edge case da spec).

**Alternativas**: `sessionStorage` (mais atrito, rejeitado em CL-02); só memória (login a
cada F5 — rejeitado em CL-02); cookie `HttpOnly` (exige endpoint de _logout_ server-side e
CSRF — fora de escopo, é 055).

---

## D8 — Decodificação de `exp` no cliente sem verificar assinatura

**Decisão**: `decode-jwt.ts` faz `JSON.parse(atob(base64url→base64(payload)))` e lê `exp`
(segundos epoch). **Não** valida assinatura — o cliente não tem o segredo e não é o seu
papel. Uso único: logout **proativo** quando `exp*1000 <= Date.now()` (com margem de 5 s),
evitando disparar uma chamada que já se sabe que dará 401.

**Rationale**: a fonte de verdade da validade é o backend (o guard). O cliente só quer
evitar trabalho inútil e mostrar a tela certa. Parse manual (~10 linhas) evita a dep
`jwt-decode`.

**Alternativas**: `jwt-decode` (dep desnecessária); confiar só no 401 do servidor (funciona,
mas causa um _flash_ de tela protegida + erro a cada abertura com token vencido).

---

## D9 — "Uma única transição" no tratamento de 401 (FR-028, SC-007)

**Decisão**: `api-client.ts` mantém um flag de módulo `expirando`. No primeiro `401` de uma
resposta cujo path **não** é `/auth/token`: se `expirando` já é `true`, apenas rejeita a
_promise_; senão marca `expirando=true`, chama `onUnauthorized()` (limpa o token via
`token-storage`, seta `logoutReason='expirada'` no `AuthProvider`, `queryClient.clear()`),
e agenda `expirando=false` no próximo _tick_. `RequireAuth` re-renderiza (token agora
`null`) e faz **um** `<Navigate to="/login">`. As N _promises_ 401 concorrentes viram N
rejeições tratáveis, mas só **uma** limpeza/navegação.

**Rationale**: idempotência no cliente espelha o Princípio de idempotência do backend. O
flag + `queryClient.clear()` evitam tempestade de re-fetch e navegações múltiplas.

**Alternativas**: _debounce_ por tempo (frágil); tratar no `onError` de cada query (N
efeitos — rejeitado); interceptar no nível do `QueryCache` apenas (não cobre `fetch`
direto — o flag no `apiFetch` cobre os dois).

---

## D10 — `AuthModule` como infra, não como bounded context

**Decisão**: `AuthModule` é importado pelo `AppModule` no grupo "Infra transversal"
(junto de `ConfigModule`/`PrismaModule`/`HealthModule`). Não entra em
`app.context-modules.ts` (`CONTEXT_MODULES` continua com 11). O `JwtAuthGuard` é provido
como `APP_GUARD` dentro do `AuthModule`.

**Rationale**: o guard vale para **todos** os contextos e `auth` não é dono de entidade de
domínio — é infra, como config e health. As e2e de `/health` afirmam "exatamente 11
contextos"; manter a lista intacta evita regressão e reflete a verdade arquitetural. A
spec 004 (RBAC) adiciona uma camada de permissão **sobre** este guard, provavelmente como
um segundo `APP_GUARD` ou estendendo este — sem mover `auth` para dentro dos contextos.

**Alternativas**: pôr o controller/guard em `api/` (mistura borda de composição com
infra de segurança); criar um 12º contexto `auth` (contraria a lista canônica da
constituição e quebra as e2e do health).
