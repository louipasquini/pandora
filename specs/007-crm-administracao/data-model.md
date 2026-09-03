# Data Model — 007 crm-administracao

**Migração:** `prisma/migrations/<ts>_crm_admin/` — 5ª migração de negócio (após `_rbac`,
`_clientes`, `_clientes_primario_unico`, `_ingestao`). 6 tabelas, 4 enums novos.

Convenções (spec 001/004/005/006): PK `id String @id @db.Uuid` gerada na app
(`EntidadeId.novo()`); `criado_em @default(now()) @db.Timestamptz(6)`,
`atualizado_em @updatedAt @db.Timestamptz(6)`; `@@map`/`@map` para snake_case. Sem seed de
negócio.

---

## Enums

```prisma
enum EquipeTipo      { COMERCIAL  ATENDIMENTO  CS }
enum PapelEquipe     { LIDER  MEMBRO }
enum IntegracaoTipo  { API_KEY  WEBHOOK  CONEXAO_INTERNA }
enum IntegracaoAlvo  { FINANCEIRO  MARKETING  CENTRAL  EXTERNO }
```

`dia_semana` **não** é enum — `Int` 0–6 (0 = domingo), alinhado a `Date.getUTCDay()`.

---

## `equipe` — time / squad

| Campo | Tipo | Regras |
|---|---|---|
| `id` | `String @db.Uuid` | PK, UUID v7 na app |
| `nome` | `String` | obrigatório, 1–120 chars |
| `descricao` | `String?` | ≤ 500 chars |
| `tipo` | `EquipeTipo` | obrigatório |
| `ativo` | `Boolean @default(true)` | `false` = some das listas padrão; entradas de expediente dela deixam de valer |
| `criado_em` / `atualizado_em` | `Timestamptz(6)` | |

Relações: `membros EquipeMembro[]`, `janelas JanelaAtendimento[]`, `feriados Feriado[]`
(todas `onDelete: Restrict` — não há `DELETE` de `equipe`).

**Invariantes:** sem `DELETE` (só `ativo=false`). `nome` não é único (pode haver dois times
"Comercial" de tipos/épocas diferentes) — decisão registrada; se o dono quiser unicidade,
é `@@unique` numa spec futura.

---

## `equipe_membro` — vínculo usuário ↔ equipe

| Campo | Tipo | Regras |
|---|---|---|
| `id` | `String @db.Uuid` | PK |
| `equipe_id` | `String @db.Uuid` | FK → `equipe.id`, `onDelete: Restrict` |
| `usuario_id` | `String @db.Uuid` | FK → `usuario.id` (spec 004), `onDelete: Restrict` |
| `papel` | `PapelEquipe` | `LIDER` \| `MEMBRO` |
| `entrou_em` | `Timestamptz(6)` | default `agoraUtc()` na criação |
| `saiu_em` | `Timestamptz(6)?` | `null` = vínculo ativo; preenchido ao remover |
| `criado_em` / `atualizado_em` | `Timestamptz(6)` | |

**Uniques / índices:**
- `@@index([usuarioId])` — "equipes de um usuário".
- `@@index([equipeId, saiuEm])` — listar membros ativos.
- **Índice único PARCIAL** (via `migration.sql` cru, Prisma não expressa):
  `CREATE UNIQUE INDEX equipe_membro_ativo_unico ON equipe_membro (equipe_id, usuario_id)
  WHERE saiu_em IS NULL;` → **≤1 vínculo ativo por par**; histórico de reentradas permitido.

**Transições:**
- criar → `saiu_em = null`. Se já existe ativo do par → `P2002` → **409**.
- `PATCH papel` → troca `papel` (audita delta).
- remover → `saiu_em = agoraUtc()`. Já tinha `saiu_em` → **no-op** (sem audit).
- `usuario_id` inexistente em `usuario` → FK falha → **404/422** (checado antes, mensagem
  clara).

---

## `janela_atendimento` — faixa de expediente

| Campo | Tipo | Regras |
|---|---|---|
| `id` | `String @db.Uuid` | PK |
| `equipe_id` | `String @db.Uuid?` | FK → `equipe.id` nullable; `null` = **global** |
| `dia_semana` | `Int` | 0–6 (0 = domingo). `@@index` junto de `equipe_id` |
| `hora_inicio` | `Int` | minutos locais 0–1439 |
| `hora_fim` | `Int` | minutos locais 1–1440; **`hora_fim > hora_inicio`** (CL-02) → senão 422 |
| `ativo` | `Boolean @default(true)` | |
| `criado_em` / `atualizado_em` | `Timestamptz(6)` | |

Índice: `@@index([equipeId, diaSemana, ativo])`.

**Invariantes:** `hora_fim > hora_inicio` (sem cruzar meia-noite — CL-02). Sobreposição /
duplicata permitida (avaliação por união). `DELETE` físico permitido (config sem histórico;
trilha no audit).

---

## `feriado` — data sem expediente

| Campo | Tipo | Regras |
|---|---|---|
| `id` | `String @db.Uuid` | PK |
| `equipe_id` | `String @db.Uuid?` | FK nullable; `null` = **global** |
| `data` | `@db.Date` | data-calendário local (sem hora/fuso) |
| `descricao` | `String` | 1–200 chars |
| `recorrente_anual` | `Boolean @default(false)` | `true` → casa por `(mês, dia)` todo ano |
| `criado_em` / `atualizado_em` | `Timestamptz(6)` | |

Índice: `@@index([equipeId])`. (O casamento por `(mês,dia)` é feito na função pura sobre o
conjunto carregado — o volume é dezenas de linhas, não vale índice funcional.)

**Invariantes:** `recorrente_anual` + `data = 29/02` → não casa em ano sem 29/02, não
desloca (CL-04). `DELETE` físico permitido.

---

## `integracao` — cadastro de conexão externa/interna

| Campo | Tipo | Regras |
|---|---|---|
| `id` | `String @db.Uuid` | PK |
| `nome` | `String` | obrigatório, 1–120 chars |
| `tipo` | `IntegracaoTipo` | `API_KEY` \| `WEBHOOK` \| `CONEXAO_INTERNA` |
| `alvo` | `IntegracaoAlvo` | `FINANCEIRO` \| `MARKETING` \| `CENTRAL` \| `EXTERNO` |
| `config` | `Json @default("{}")` | _free-form_ por tipo; **NUNCA** contém segredo |
| `segredo_cifrado` | `String?` | base64(`iv|authTag|ciphertext`) AES-256-GCM; para `WEBHOOK`/`EXTERNO` |
| `segredo_hash` | `String?` | sha256hex do valor pleno; **só** para `API_KEY` interna gerada |
| `ativo` | `Boolean @default(true)` | |
| `ultimo_uso_em` | `Timestamptz(6)?` | começa `null`; **nada nesta spec escreve** (reservado 011/019–022) |
| `criado_em` / `atualizado_em` | `Timestamptz(6)` | |

Índices: `@@index([tipo])`, `@@index([alvo])`, `@@index([ativo])`.

**Invariantes:**
- No máx. **um** de `segredo_cifrado` / `segredo_hash` preenchido.
- `API_KEY` sem `segredo` no `POST` → sistema gera `crm_` + 40 hex, grava `segredo_hash`,
  devolve `apiKey` **só** na resposta de criação/rotação.
- `WEBHOOK`/`EXTERNO` com `segredo` → `cifrar()` → `segredo_cifrado`.
- `CONEXAO_INTERNA` pode não ter segredo (`segredoDefinido = false`).
- `rotacionar`/`PATCH segredo` numa integração cujo `tipo` não comporta segredo → **409/422**.
- Sem `DELETE` (só `ativo=false`).

### Projeção de leitura (o que `GET` devolve) — CONTRATO DE SEGURANÇA

```jsonc
{
  "id": "...", "nome": "...", "tipo": "WEBHOOK", "alvo": "EXTERNO",
  "config": { /* … sem segredo … */ },
  "ativo": true,
  "ultimoUsoEm": null,
  "segredoDefinido": true,          // = (segredo_cifrado != null || segredo_hash != null)
  "segredoMascarado": "••••••1a2b", // últimos 4 do valor; null se !segredoDefinido
  "criadoEm": "...", "atualizadoEm": "..."
}
```

`segredo_cifrado`, `segredo_hash` e o valor pleno **nunca** aparecem em `GET` (lista ou
detalhe), **nunca** em `crm_admin_audit`, **nunca** em log. `segredoMascarado`:
- `WEBHOOK`/`EXTERNO`: decifra em memória **só** para pegar os últimos 4 e descartar — ou,
  para não decifrar em leitura, guarda-se um `segredo_ultimos4` em claro no `POST`/rotação
  (4 chars não são segredo). **Decisão:** guardar `segredo_ultimos4 String?` — leitura não
  decifra nada.

> Ajuste ao schema: adicionar `segredo_ultimos4 String?` a `integracao` (4 chars, para a
> máscara sem decifrar). `data-model` e `contracts/integracoes.md` refletem isso.

---

## `crm_admin_audit` — trilha administrativa (append-only)

Forma **idêntica** a `clientes_audit` / `ingestao_audit` (core `RegistroAuditoria`):

| Campo | Tipo |
|---|---|
| `id` | `String @db.Uuid` |
| `autor` | `String` (sub do JWT ou id da credencial de serviço) |
| `quando` | `Timestamptz(6)` |
| `entidade` | `String` — `'equipe'` \| `'equipe_membro'` \| `'janela_atendimento'` \| `'feriado'` \| `'integracao'` |
| `entidade_id` | `String @db.Uuid` |
| `campo` | `String` — eixo: `'criado'` \| `'editado'` \| `'membro_adicionado'` \| `'membro_removido'` \| `'papel_trocado'` \| `'desativado'` \| `'segredo_definido'` \| `'segredo_rotacionado'` \| `'removido'` |
| `valor_anterior` | `Json?` |
| `valor_novo` | `Json?` |
| `motivo` | `String` |
| `origem` | `String` — sempre `'AJUSTE_MANUAL'` |
| `criado_em` | `Timestamptz(6)` |

`@@index([entidade, entidadeId])`.

**Invariantes:** _append-only_ (app nunca `UPDATE`/`DELETE`). Grava **só com delta real**
(`jsonIgual(anterior, novo)` → não grava). **Nunca** contém segredo — para `integracao`, o
delta de segredo é `{ "segredo": "definido" }` / `{ "segredo": "rotacionado" }` (marcador).

---

## Função pura `estaEmExpediente`

`src/crm/domain/expediente.ts`

```ts
type JanelaAplic  = { equipeId: string | null; diaSemana: number; inicioMin: number; fimMin: number; ativo: boolean };
type FeriadoAplic = { equipeId: string | null; mes: number; dia: number; ano: number | null; recorrenteAnual: boolean };

interface OpcoesExpediente {
  janelas: JanelaAplic[];
  feriados: FeriadoAplic[];
  equipe?: { id: string; ativo: boolean } | null;
}

function estaEmExpediente(instante: Date, o: OpcoesExpediente): boolean
```

**Algoritmo (livre de locale):**
1. `partes = Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', hourCycle: 'h23',
   year, month, day, weekday, hour, minute }).formatToParts(instante)` → `(anoL, mesL, diaL,
   dowL 0–6, hL, minL)`. `tLocalMin = hL*60 + minL`.
2. `equipeAtiva = o.equipe?.ativo === true ? o.equipe.id : null`.
   `aplicavel(x) = x.equipeId === null || x.equipeId === equipeAtiva`.
3. **Feriado:** se existe `f` em `o.feriados` com `aplicavel(f)` e:
   - `f.recorrenteAnual` → `f.mes === mesL && f.dia === diaL`
     (29/02: só casa se `diaL === 29 && mesL === 2`, i.e. ano local bissexto — CL-04);
   - senão → `f.mes === mesL && f.dia === diaL && f.ano === anoL`
   ⇒ **return false**.
4. **Janela:** `return o.janelas.some(j => j.ativo && aplicavel(j) && j.diaSemana === dowL
   && j.inicioMin <= tLocalMin && tLocalMin < j.fimMin)`.
5. Nenhuma janela casa → `false` (passo 4 já cobre; sem janela aplicável ⇒ `some` = `false`).

**Propriedades garantidas por teste:** determinística; independente de `TZ` do processo
(matriz CI); início inclusivo / fim exclusivo; feriado subtrai mesmo dentro da janela;
união global+equipe; equipe inativa ignorada; sem janela ⇒ `false`.

`ExpedienteService.consultar(instante, equipeId?)` carrega:
- `janelas` = `janela_atendimento` WHERE `equipe_id IS NULL OR equipe_id = :equipeId`;
- `feriados` = `feriado` WHERE idem;
- `equipe` = `equipe` por `:equipeId` (para o `ativo`);
e chama `estaEmExpediente`.

---

## Impacto em artefatos existentes

- `schema.prisma` — +6 models, +4 enums. `Usuario` ganha a relação inversa `equipesComoMembro
  EquipeMembro[]` (ou fica sem inversa nomeada — decidir na task; a 004 não expõe relações
  de negócio no `Usuario`, então **sem inversa** para não alargar a superfície do modelo de
  RBAC; a FK fica só do lado `equipe_membro`).
- `src/config/env.schema.ts` — `+ CRM_INTEGRACAO_CIFRA_KEY` (base64 32 bytes → `.length` 44,
  `z.string().refine(base64 && decoded.length===32)`), obrigatória em todo `NODE_ENV`.
- `src/core/config/index.ts` — re-export tipado da nova chave.
- `src/auth/rbac/catalogo.ts` — `+` 4 permissões do recurso `crm_admin`.
- `.env` / `.env.example` / `.github/workflows/ci.yml` / `backend/test/setup-db.ts` —
  fixture da chave de cifra (32 bytes fixos base64).
- `CONTEXT_MODULES` — **inalterado** (11). `context-modules.e2e-spec.ts` — inalterado.
