# Research — 007 crm-administracao

Fase 0. Cada decisão: **o que**, **por quê**, **alternativas rejeitadas**. Nenhum
`NEEDS CLARIFICATION` restante (CL-01..CL-04 resolvidos no `/speckit-clarify`, 2026-09-03).

---

## 1. Fuso horário do expediente — `Intl` nativo vs. biblioteca

**Decisão:** usar `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', hourCycle:
'h23', year/month/day/weekday/hour/minute })` (ou `formatToParts`) para converter o
`instante` UTC em (data local, dia da semana, `hh:mm` local). **0 dependência.**

**Por quê:**
- Node 24 embarca ICU completo (`full-icu` é _default_ desde o Node 13) — `America/Sao_Paulo`
  e suas regras históricas de _offset_ estão na base de fusos do sistema/ICU.
- É a mesma aposta "sem lib para o que cabe em poucas linhas" já feita no projeto: o
  `setInterval` in-house da 006 (`@nestjs/schedule` rejeitado) e a validação de CPF/CNPJ à
  mão da 005.
- `estaEmExpediente` só precisa de **campos de calendário locais** (não de aritmética de
  data com fuso), que é exatamente o que `formatToParts` entrega, de forma determinística e
  **independente do `TZ` do processo** (o `timeZone` é explícito no options).
- A matriz `TZ` da CI (UTC / America/Sao_Paulo / Asia/Tokyo, herdada da 002) cobre a
  regressão.

**Alternativas rejeitadas:**
- **`date-fns-tz`** — +1 dep (e `date-fns` transitiva) para um `utcToZonedTime` que o
  `Intl` já faz. Ganho nulo.
- **`luxon`** — API agradável, mas +1 dep de ~70 kB para uma única função pura.
- **_offset_ fixo `-03:00` _hard-coded_** — rejeitado explicitamente na spec (Assumptions):
  quebra se o horário de verão voltar. `Intl` acompanha a base de fusos.
- **`Temporal`** (TC39) — ainda atrás de _flag_ / não estável no Node 24 LTS.

---

## 2. `hora_inicio` / `hora_fim` — `Int` (minutos) vs. `@db.Time`

**Decisão:** `Int` = **minutos desde 00:00 local** (0–1439). `hora_fim > hora_inicio`
validado na borda (CL-02).

**Por quê:**
- Comparação de expediente vira `inicioMin <= tLocalMin < fimMin` — aritmética de inteiro,
  sem parsing de `time`, sem armadilha de fuso (o Prisma mapeia `@db.Time` para `Date` do
  JS com data-base `1970-01-01`, fácil de errar).
- Serializa trivial no JSON da API (`"09:00"` ↔ `540` com um helper puro nos DTOs).
- CL-02 já proíbe janela que cruza a meia-noite, então não há caso `fim < inicio`.

**Alternativas rejeitadas:**
- **`@db.Time`** — tipo "correto" no papel, mas o mapeamento Prisma→JS agrega complexidade
  e risco de _off-by-timezone_ sem benefício (não guardamos segundos nem fuso por linha).
- **`String "HH:MM"`** — exige validação de formato + comparação lexicográfica frágil.

---

## 3. Resolução de escopo por equipe — **união** (CL-01)

**Decisão:** "aplicável" = entradas globais (`equipe_id IS NULL`) **∪** entradas da `equipe`
informada **se ela estiver `ativa`**. Sem `equipeId` na consulta, só as globais. Feriado
aplicável (global **ou** da equipe) sempre subtrai.

**Por quê (registro da decisão do dono do produto):**
- Modelo mais simples e previsível; cobre o caso real ("a equipe X também atende sábado de
  manhã") adicionando uma janela.
- Um _override_ total (equipe define o expediente inteiro, ignorando o global) não tem caso
  de uso hoje e pode ser introduzido depois **sem quebra de dados** (bastaria um flag
  `ignora_global` na `equipe` numa spec futura).
- Equipe **inativa** → suas entradas somem da união (FR-008), sem apagar nada.

**Alternativas rejeitadas:** _override_ de tudo; _override_ só de janelas (feriados somam) —
ambas adicionam ramo condicional na função pura sem demanda.

---

## 4. Feriado recorrente — casamento por `(mês, dia)` exato (CL-04)

**Decisão:** `recorrente_anual = true` casa quando `mês(data_local) == mês(feriado.data)` e
`dia(data_local) == dia(feriado.data)`. **29/02 não casa** em anos sem 29/02 (não desloca
para 28/02). `recorrente_anual = false` casa só a data exata (ano incluso).

**Por quê:** regra trivial, sem calendário especial; nenhum feriado nacional brasileiro cai
em 29/02, então o caso é teórico. Documentado para o teste cobrir.

---

## 5. Segredo de integração — cifra AES-256-GCM; API key interna — só hash

**Decisão:**
- `tipo != API_KEY` com `segredo` fornecido → `segredo_cifrado = base64(iv[12] | authTag[16]
  | ciphertext)` com **AES-256-GCM** (`node:crypto.createCipheriv`), chave de 32 bytes vinda
  de `CRM_INTEGRACAO_CIFRA_KEY` (`.env`, base64, obrigatória, sem default).
- `tipo == API_KEY` sem `segredo` → o sistema **gera** `crm_` + 40 hex (20 bytes de
  `randomBytes`), guarda **só** `segredo_hash = sha256hex(valor)`, devolve o valor pleno
  **apenas** na resposta de criação/rotação.
- Leitura sempre projeta `{ segredoDefinido: boolean, segredoMascarado: string | null }` —
  **nunca** `segredo_cifrado`/`segredo_hash`/valor.

**Por quê:**
- AES-256-GCM dá confidencialidade **+ integridade** (authTag) com API estável do
  `node:crypto` — **0 dep**.
- API key interna nunca precisa ser lida de volta pelo Pandora (quem valida é o próprio
  Pandora comparando hash na spec que consumir), então **hash irreversível** é mais seguro
  que cifra reversível.
- Chave única de `.env` segue o Padrão Transversal "config/segredos: `.env`, nunca
  hard-coded, boot falha cedo". Rotação da **chave de cifra** (re-encriptar em massa) é
  _ops_, fora do escopo (spec 055 / runbook).

**Alternativas rejeitadas:**
- **`libsodium`/`@noble/ciphers`** — +1 dep; `node:crypto` cobre AES-GCM.
- **Cifra reversível também para a API key** — desnecessário e menos seguro; nada lê a key
  de volta.
- **Guardar segredo em claro "porque é interno"** — viola o Padrão Transversal e o SC-004;
  um `GET` da lista vazaria tudo.
- **KMS/Secret Manager externo** — a infra do projeto é `.env` (spec 001/003); introduzir
  KMS é decisão de _ops_ fora desta spec.

---

## 6. Unicidade de `equipe_membro` — índice único **parcial**

**Decisão:** `CREATE UNIQUE INDEX ... ON equipe_membro (equipe_id, usuario_id) WHERE saiu_em
IS NULL;` no `migration.sql` cru (o Prisma não expressa índice parcial no schema — mesmo
recurso usado na 005 para o primário de contato).

**Por quê:** a regra é "≤1 vínculo **ativo** por par", mas **histórico** de entradas/saídas
repetidas do mesmo usuário na mesma equipe é permitido (FR-003). Índice parcial impõe a
regra no banco (corrida de dois `POST` simultâneos → o 2º toma `P2002` → 409), sem proibir o
histórico.

**Alternativas rejeitadas:** unique total `(equipe_id, usuario_id)` — proíbe reentrada;
checagem só na aplicação — corrida escapa.

---

## 7. Auditoria — tabela própria `crm_admin_audit`

**Decisão:** tabela `crm_admin_audit` dedicada ao contexto, forma canônica
`RegistroAuditoria` do core (`montarRegistroAuditoria`, `origem = AJUSTE_MANUAL`),
_append-only_, **só delta real** (`jsonIgual(anterior, novo)` → no-op). Serviço
`CrmAdminAuditService` simétrico ao `RbacAuditService` (004) / `ClientesAuditService` (005)
/ `IngestaoAuditService` (006).

**Por quê:** o projeto já tem **uma tabela `_audit` por contexto** (não uma global) — o
painel consolidado é a spec 053, que fará `UNION`. Manter o padrão evita decisão nova.
Segredo entra no delta como **marcador** (`{ segredo: 'definido' }` / `{ segredo:
'rotacionado' }`), nunca valor (FR-033).

**Alternativas rejeitadas:** reusar `rbac_audit` (entidades não são de RBAC); tabela global
agora (antecipa a 053).

---

## 8. Endpoint `GET /crm/admin/expediente` — forma

**Decisão:** `GET /crm/admin/expediente?instante=<ISO|epoch>&equipeId=<uuid>?` sob
`crm_admin:ver`. `instante` ausente → "agora" (`agoraUtc()`). `instante` malformado → 400
(via `parseInstante` do core, que devolve `null` + motivo). Resposta `{ emExpediente:
boolean, instante: <ISO normalizado>, equipeId?: string }`. Usa **a mesma** função
`estaEmExpediente` do domínio (SC — sem divergência API↔código).

**Por quê:** o painel precisa do indicador "no expediente agora?" e 012/014 vão querer um
_probe_ HTTP antes de ter a porta in-process. `GET` com query é idempotente e cacheável.

**Alternativas rejeitadas:** `POST` com corpo — não é mutação, `GET` é semanticamente certo;
expor só via porta in-process — o painel é front, precisa de HTTP.

---

## 9. `janela`/`feriado` — `DELETE` físico vs. `ativo`

**Decisão:** `janela_atendimento` tem `ativo` (bool) **e** aceita `DELETE` físico; `feriado`
só `DELETE` físico. Ambos sem tabela de histórico — a trilha fica no `crm_admin_audit`.

**Por quê:** config de horário é pequena e volátil; manter linhas "mortas" polui a
avaliação e a UI. O audit já registra a remoção (quem/quando/o quê). `equipe`/`integracao`,
por serem referenciadas por outras entidades (membros; futuros adapters), usam `ativo` e
**não** têm `DELETE`.

---

## 10. Serialização de `hora` e `dia_semana` nos contratos

**Decisão:** API aceita/retorna `horaInicio`/`horaFim` como `"HH:MM"` (string) e converte
para/de `Int` minutos num helper puro nos DTOs; `diaSemana` como `0..6` (0 = domingo),
alinhado ao `Date.getUTCDay()` e ao `weekday` do `Intl` mapeado.

**Por quê:** `"09:00"` é legível no painel e nos testes; o inteiro é detalhe de storage.
`0 = domingo` casa a convenção JS e evita tabela de-para.

---

## Consolidação

| # | Decisão | Dep nova? |
|---|---------|-----------|
| 1 | Fuso via `Intl` nativo (`timeZone` fixo) | não |
| 2 | `hora_*` como `Int` minutos locais | não |
| 3 | Escopo por equipe = **união** global+equipe (CL-01) | — |
| 4 | Feriado recorrente casa `(mês,dia)` exato; 29/02 não desloca (CL-04) | — |
| 5 | Segredo: AES-256-GCM (`node:crypto`); API key: SHA-256 só-hash | não |
| 6 | `equipe_membro` unique **parcial** `WHERE saiu_em IS NULL` (SQL cru) | não |
| 7 | `crm_admin_audit` próprio, forma canônica do core, append-only, delta real | não |
| 8 | `GET /crm/admin/expediente` reusa a função pura | não |
| 9 | `janela`/`feriado` aceitam `DELETE` físico; `equipe`/`integracao` só `ativo` | — |
| 10 | Contrato usa `"HH:MM"` + `diaSemana 0..6`; storage é `Int` | — |

**Total: 0 dependência nova. 1 migração Prisma. 1 chave de `.env` nova.**
