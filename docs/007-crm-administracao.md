# 007 — Administração do CRM: equipes, expediente/feriados, integrações e auditoria

Primeira fatia da **Fase 1 (CRM)** e primeira entidade de negócio do _bounded context_
**`crm`**, que deixa de ser um módulo vazio e passa a ser o **dono** de `equipe`,
`janela_atendimento`, `feriado` e `integracao`. Entrega o painel de Administração da visão
Parte 8.11 — **sem reimplementar** nada da spec 004 (perfis, permissões, usuários e o guard
de RBAC seguem lá; esta spec só **estende o catálogo** com o recurso `crm_admin`).

Spec, plano e contratos: [`specs/007-crm-administracao/`](../specs/007-crm-administracao/).

`CONTEXT_MODULES` segue com **11** — `crm` já estava na lista (spec 001). **5ª migração de
negócio** (`20260903184256_crm_admin` + `20260903184300_crm_admin_membro_unico`).
**0 dependência nova** (backend e frontend). **+1 variável de ambiente**
(`CRM_INTEGRACAO_CIFRA_KEY`).

---

## Domínio puro (`backend/src/crm/domain/`, sem banco)

| Arquivo | O quê |
| --- | --- |
| `expediente.ts` | **`estaEmExpediente(instante, { janelas, feriados, equipe? }) → boolean`** — pura, determinística, **livre de _locale_**. Converte `instante` para a hora local de **America/Sao_Paulo** via `Intl.DateTimeFormat` nativo (`timeZone` explícito — não lê o `TZ` do processo); extrai `data`, dia da semana (0 = domingo, via `Date.UTC(...).getUTCDay()`) e minutos locais. `true` sse a hora cai em **alguma** janela ativa aplicável (`inicio <= t < fim`, início inclusivo / fim exclusivo) **e** a data não é feriado aplicável. Feriado subtrai **mesmo dentro** de uma janela. Feriado recorrente casa por `(mês, dia)` exato — 29/02 não desloca para 28/02 (CL-04). Sem janela aplicável → `false` (nunca "aberto por omissão"). "Aplicável" = entradas globais ∪ entradas da equipe informada **se ela estiver ativa** (CL-01 — união, nunca _override_). |
| `cifra.ts` | `cifrar(texto, chave)` / `decifrar(blob, chave)` — **AES-256-GCM** (`node:crypto`), IV aleatório de 12 bytes, _authTag_ de 16; blob = `base64(iv | tag | ciphertext)`. Confidencialidade + integridade. Chave de 32 bytes de `CRM_INTEGRACAO_CIFRA_KEY`. `decifrar` não tem caminho de _endpoint_ nesta spec (o segredo cifrado só será lido por 011/019–022). |
| `api-key.ts` | `gerarApiKey()` → `{ valor: 'crm_' + 40 hex, hash }` (SHA-256 hex); `hashSegredo(valor)`. A API key interna é **só-hash** (irreversível): o valor pleno é revelado **uma única vez** na criação/rotação e nunca mais. |
| `mascarar-segredo.ts` | `ultimos4De(valor)` e `mascararSegredo(ultimos4)` → `'••••••' + últimos 4`. A leitura **nunca** decifra: guardamos `segredo_ultimos4` em claro (4 chars não são segredo) e a máscara vem dele. |
| `tipos.ts` | enums re-exportados do `@prisma/client` + tipos de apoio (`JanelaAplic`, `FeriadoAplic`, `OpcoesExpediente`, `EntradaAuditoriaCrm`). |

Testes unitários (sem banco): `expediente.spec.ts` (tabela de casos de
`contracts/estaEmExpediente.md` — dentro/fora, borda `09:00`/`18:00`, feriado fixo e
recorrente global e por equipe, união, equipe inativa, 29/02, zero janela, determinismo
500×, `process.env.TZ` irrelevante), `cifra.spec.ts` (round-trip, authTag adulterado → erro,
IV distinto), `api-key.spec.ts` (formato, hash estável, 1000 sem colisão),
`mascarar-segredo.spec.ts`.

---

## Persistência (Prisma — 5ª migração de negócio)

`20260903184256_crm_admin` cria 6 tabelas + 4 enums (`EquipeTipo`, `PapelEquipe`,
`IntegracaoTipo`, `IntegracaoAlvo`). `20260903184300_crm_admin_membro_unico` acrescenta o
**índice único parcial** (o Prisma não o expressa no schema — mesmo padrão da spec 005).

| Tabela | Notas |
| --- | --- |
| `equipe` | `nome`, `descricao?`, `tipo COMERCIAL\|ATENDIMENTO\|CS`, `ativo`. **Sem `DELETE`** (só `ativo=false`). |
| `equipe_membro` | FK `usuario_id → usuario.id` (spec 004, `onDelete: Restrict`), `papel LIDER\|MEMBRO`, `entrou_em`, `saiu_em?`. **Índice único parcial** `(equipe_id, usuario_id) WHERE saiu_em IS NULL` → ≤1 vínculo **ativo** por par; histórico de reentrada permitido. Um usuário em N equipes. Remoção = preenche `saiu_em` (nunca `DELETE`). |
| `janela_atendimento` | `equipe_id?` (`null` = global), `dia_semana` 0–6, `hora_inicio`/`hora_fim` como `Int` **minutos locais** (0–1440), `ativo`. `hora_fim > hora_inicio` (sem cruzar meia-noite — CL-02) validado no serviço → **422 `janela_invalida`**. `DELETE` físico (config sem histórico; trilha no audit). |
| `feriado` | `equipe_id?`, `data @db.Date`, `descricao`, `recorrente_anual`. `DELETE` físico. |
| `integracao` | `nome`, `tipo API_KEY\|WEBHOOK\|CONEXAO_INTERNA`, `alvo FINANCEIRO\|MARKETING\|CENTRAL\|EXTERNO`, `config` jsonb (**sem segredo**), `ativo`, `ultimo_uso_em?` (reservado 011/019–022 — nada nesta spec escreve). Segredo em `segredo_cifrado` (AES-GCM) **ou** `segredo_hash` (API key) + `segredo_ultimos4` (claro, só p/ a máscara). **Sem `DELETE`**. |
| `crm_admin_audit` | Forma canônica `RegistroAuditoria` do core (`montarRegistroAuditoria`, `origem = AJUSTE_MANUAL`). **Append-only** (sem `UPDATE`/`DELETE`). Simétrica a `rbac_audit`/`clientes_audit`/`ingestao_audit`. |

`Usuario` ganhou a relação inversa `equipesComoMembro EquipeMembro[]` (só o lado Prisma —
sem endpoint novo no RBAC).

---

## Contrato de segurança do segredo de integração

**Invariável, verificado por teste e2e** (`grep` do valor em todas as respostas + em
`crm_admin_audit` + nos logs → 0 ocorrências):

- Nenhuma leitura (`GET` lista ou detalhe) devolve o segredo em claro, nem
  `segredo_cifrado`/`segredo_hash`. Projeta só `segredoDefinido` (bool) e `segredoMascarado`
  (`'••••••' + últimos 4`).
- `POST /crm/admin/integracoes` com `tipo = API_KEY` **sem** `segredo` → o sistema **gera**
  `crm_<40 hex>`, grava só o hash, e devolve `apiKey` + `aviso` **apenas** na resposta de
  criação. Demais tipos com `segredo` → cifrado (AES-256-GCM).
- `POST /crm/admin/integracoes/{id}/rotacionar` → novo valor revelado **uma vez**; o anterior
  deixa de valer. `rotacionar` de `CONEXAO_INTERNA` sem segredo → **409
  `sem_segredo_para_rotacionar`**.
- `PATCH` sem `segredo` preserva o segredo; com `segredo` conta como **rotação** na auditoria.
- No `crm_admin_audit`, o segredo entra como **marcador** (`{ segredo: 'definido' }` /
  `{ segredo: 'rotacionado' }`), **nunca** o valor.
- `config` com chave suspeita (`token`/`secret`/`apiKey`/`password`) → **422** (checagem
  defensiva no zod).

A chave de cifra vem de **`CRM_INTEGRACAO_CIFRA_KEY`** (base64 de 32 bytes), **obrigatória
em todo `NODE_ENV`** — o boot aborta sem ela (sem default silencioso). Rotação da chave de
cifra (re-encriptação em massa) é operação de _ops_, fora do escopo.

---

## RBAC 004 estendido

`src/auth/rbac/catalogo.ts` ganha o recurso **`crm_admin`**:

| Permissão | Uso |
| --- | --- |
| `crm_admin:ver` | todas as leituras `/crm/admin/**` + `GET /crm/admin/expediente` + `GET /crm/admin/auditoria` |
| `crm_admin:gerir_equipes` | `POST/PATCH/DELETE` de `equipes` e membros |
| `crm_admin:gerir_expediente` | `POST/PATCH/DELETE` de `janelas-atendimento` e `feriados` |
| `crm_admin:gerir_integracoes` | `POST/PATCH` de `integracoes` + `/rotacionar` |

O perfil de sistema `administrador` e a credencial de serviço concedem as 4 **de graça**
(special-case do `SujeitoRbacService` + `prisma/seed.ts` idempotente já existentes) — **0
migração de dados, 0 seed novo**. Rota autenticada sem permissão → **403** (≠ 401), corpo
genérico da 004.

---

## Endpoints (`/crm/admin/**`)

Equipes: `GET equipes` (filtros `ativo`/`tipo`/`usuarioId`, paginação), `GET equipes/:id`
(membros ativos + histórico), `POST equipes`, `PATCH equipes/:id`,
`POST equipes/:id/membros` (409 `vinculo_ativo_existente`; 422 usuário inexistente),
`PATCH equipes/:id/membros/:usuarioId`, `DELETE equipes/:id/membros/:usuarioId` (preenche
`saiu_em`; idempotente).

Expediente: `GET/POST/PATCH/DELETE janelas-atendimento`, `GET/POST/PATCH/DELETE feriados`,
`GET expediente?instante=&equipeId=` → `{ emExpediente, instante, equipeId }` (usa a mesma
função pura; `instante` ausente = agora; malformado → **400 `instante_invalido`**).

Integrações: `GET integracoes` (paginado), `GET integracoes/:id`, `POST integracoes`,
`PATCH integracoes/:id`, `POST integracoes/:id/rotacionar`.

Auditoria local: `GET auditoria?entidade=&entidadeId=` (o painel consolidado é a spec 053).

---

## Frontend (`frontend/src/crm-admin/`)

Item de navegação **CRM · Administração** atrás de `crm_admin:ver`; rota `/crm/admin` sob
`<RequirePermissao>`. `CrmAdminPage` com 3 abas via `?tab=equipes|expediente|integracoes`:

- **Equipes** — lista + form de criação (só com `crm_admin:gerir_equipes`).
- **Expediente** — janelas por dia da semana + feriados + indicador **"no expediente
  agora?"** (`GET /crm/admin/expediente`); escrita só com `crm_admin:gerir_expediente`.
- **Integrações** — lista mostrando só a **máscara**; criação/rotação exibe o valor pleno
  **uma vez** num `<aside role="alert">` que **não** persiste ao recarregar; escrita só com
  `crm_admin:gerir_integracoes`.

`apiFetch` já trata 401 (spec 003) e 403 (spec 004 — banner, sem deslogar).

---

## Testes

- **Backend unit** (`jest`, sem banco): 26 novos — `expediente` (exaustivo + `TZ`),
  `cifra`, `api-key`, `mascarar-segredo`, `catalogo` (recurso `crm_admin`). Total 296.
- **Backend e2e** (`jest` e2e, Postgres real): 20 novos — migração; janela inválida → 422;
  CRUD + 1 audit por escrita (`PATCH` no-op → 0); `estaEmExpediente` via endpoint (feriado
  subtrai; união global+equipe; instante lixo → 400); integrações (máscara na resposta e no
  `GET`; API key revelada 1×; rotação; `CONEXAO_INTERNA` sem segredo → 409; `config` suspeita
  → 422; **`grep` do segredo = 0**); equipes (2º vínculo ativo → 409; usuário inexistente →
  422; `saiu_em`/histórico/reentrada; N equipes; `ativo:false`); auditoria
  (`AJUSTE_MANUAL`, autor, filtro); guard 401/403/2xx; catálogo cresce; `/health` = 11.
  Total 133.
- **Frontend** (`vitest`): 6 novos — abas montam dos endpoints; sem `gerir_*` → read-only;
  Integrações mostra só a máscara; indicador de expediente; sem `crm_admin:ver` → "sem
  permissão" (não Login). Total 50.

Regressão das specs 003–006 verde sem alteração.
