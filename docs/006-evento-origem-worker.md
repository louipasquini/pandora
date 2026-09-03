# 006 — evento_origem e worker de ingestão: event log canônico e pipeline em etapas

Segundo _bounded context_ de domínio a ganhar entidade de negócio: o `ingestao` deixa de
ser um módulo vazio e passa a ser o **dono** de `evento_origem` / `evento_etapa`. É o
**backbone** que quase todo o resto do sistema consome — o Financeiro (specs 018–025) pluga
as etapas reais do pipeline; o CRM (Workflow, spec 014) e o Marketing (spec 035) **observam**
o log; a migração (spec 031) reingere os payloads da v1 pela mesma porta.

Materializa o **Princípio IV** da constituição: o evento cru imutável é a fonte de verdade;
as projeções (`evento_etapa`, e no futuro `transacao`/`contrato`) são reconstruíveis. Substitui
o `ingerir_transacao` monolítico da v1 (uma transação de banco cobrindo todas as etapas, que
forçou `_houve_mudanca` no ORM e um `commit()` de remendo).

Spec, plano e contratos: [`specs/006-evento-origem-worker/`](../specs/006-evento-origem-worker/).

`CONTEXT_MODULES` segue com **11** — `ingestao` já estava na lista (spec 001). **4ª migração
de negócio** (`20260903171321_ingestao`). **0 dependência nova** (backend e frontend).

---

## Domínio puro (`backend/src/ingestao/domain/`, sem banco)

| Arquivo | O quê |
| --- | --- |
| `evento-canonico.ts` | Schema `zod` do contrato **`EventoCanonico`** que os adapters das specs 019–022 vão produzir de um `payload_bruto`. Núcleo **obrigatório** (`plataformaOrigem`, `idOrigem`, `tipoOrigem`, `statusOrigem` cru, `ocorridoEm`) + opcionais transportados p/ as etapas 2–6 futuras (`comprador`, `valores` como `Dinheiro` do core, `oferta`, `assinatura`, `ehAfiliada`, `referenciaExterna`, `classificacao` preliminar). `Dinheiro.valorInteiro` aceita `bigint`/number/string e normaliza p/ `bigint` (HTTP não carrega bigint). |
| `hash-evento.ts` | `hashEvento(payloadBruto)` = `sha256(canonicalizar(payloadBruto))` hex. `canonicalizar` ordena chaves recursivamente, sem espaço — **determinístico e livre de _locale_/`TZ`**. Reentrega byte-idêntica ou com chaves reordenadas → mesmo hash → dedup. Lança em valor não JSON-serializável. |
| `classificar.ts` | `classificar(canonico, tipoOrigem)` → `{classificacao, revisar, motivo?}`. **Pura, determinística.** Enum **congelado** `Classificacao` = `VENDA_PROPRIA \| VENDA_AFILIADA \| COBRANCA_TERCEIRIZADA \| REEMBOLSO \| RECORRENCIA \| OUTRO \| DESCONHECIDO`. Regras locais (CL-03): estorno por status/`tipo_origem` → `REEMBOLSO`; `ehAfiliada` → `VENDA_AFILIADA`; assinatura → `RECORRENCIA`; senão `VENDA_PROPRIA`. Sem `canonico`, ou `referenciaExterna` a outra plataforma → `DESCONHECIDO` + `revisar` (casar Asaas↔Guru de fato é a spec 024). **Nunca** um palpite (regra inviolável #15). |
| `etapas.ts` | `ETAPAS` — registro **ordenado** das 7 etapas do pipeline canônico (visão 5.3) com **dependências declaradas como dado** (CL-04): `REGISTRAR(0) → CLASSIFICAR(1) → RESOLVER_PESSOA(2) → UPSERT_TRANSACAO(3)`; `RESOLVER_VINCULO(4)` / `RESOLVER_OFERTA(5)` / `PROJETAR_CONTRATO(6)` dependem de (3), não entre si. Cada etapa carrega a `especDona` (nº da spec que a implementa de verdade). |
| `plano-passada.ts` | `planejarPassada(snapshotEtapas, max)` → `{acoes, statusEvento}`, **puro**. Por etapa: `ok`/`pulada` → `JA_OK`; `erro` com `tentativas >= max` → `ESGOTADA`; dependência não-`ok` → `BLOQUEADA`; senão → `EXECUTAR`. `statusEvento` derivado (`erro` se alguma etapa `erro`/`ESGOTADA`; senão `revisar` se alguma sinaliza ambiguidade; senão `pendente` se ainda há trabalho; senão `ok`). |

## Aplicação (`backend/src/ingestao/application/`)

- **`RegistrarEventoService.registrarEvento(entrada)`** → `{eventoId, criado}` — a **porta
  exportada** (etapa 0) que os adapters das specs 019–022 vão injetar; o endpoint HTTP
  `POST /ingestao/eventos` é um invólucro fino dela. Valida a entrada (`zod` → 422), calcula
  o `hash`, faz **upsert idempotente** pela chave `(plataforma_origem, id_origem, hash)`:
  novo → cria `evento_origem` + as **7 `evento_etapa`** (`REGISTRAR = ok`, demais `pendente`);
  reentrega → captura `P2002`, incrementa `reentregas` / `ultimo_recebido_em`, devolve o id
  existente. Chamadas concorrentes com a mesma chave → 1 linha.
- **`WorkerService.processarPassada()`** → `ResumoPassada` — seleciona eventos com trabalho
  **acionável** (etapa `pendente`, ou `erro` com `tentativas < INGESTAO_WORKER_MAX_TENTATIVAS`;
  `bloqueada` sozinha **não** re-seleciona), até `INGESTAO_WORKER_LOTE`. Um **mutex por
  evento** em memória impede duas passadas concorrentes de processar o mesmo. Para cada
  evento, roda `planejarPassada` e executa a próxima etapa `EXECUTAR` **em transação própria**
  (`processando` → executor → `ok`/`pulada`/`erro`+`tentativas++`) — commit por etapa
  (Princípio IV), sem `commit()` de remendo. Etapa `ok`/`pulada` **nunca** reexecuta
  (idempotente). Ao fim, persiste `bloqueada` para as etapas cuja dependência não ficou `ok`
  e grava o `status`/`classificacao`/`erro_detalhe` derivados no `evento_origem`.
  `definirExecutor(nome, exec)` é o ponto de extensão: as specs 018/023/024/025 (ou testes)
  plugam a etapa real **sem tocar o worker**.
- **`WorkerScheduler`** — laço `setInterval` **in-house** (0 dep — `@nestjs/schedule`
  rejeitado). Ligado por `INGESTAO_WORKER_ENABLED` (o `test/setup-db.ts` força `false`);
  intervalo `INGESTAO_WORKER_INTERVALO_MS`. _Flag_ de reentrância; erro numa passada é
  logado, nunca derruba o processo; o timer é `unref()`.
- **`etapas-noop/`** — executores _no-op_ das etapas 2–6: devolvem `{status:'pulada',
  resultado:{implementadaNa: 18|23|24|25}}`. Nenhum toca `pessoa`/`transacao`/`oferta`/
  `contrato` (SC-012).
- **`ReprocessarEventoService.reprocessar(id, {forcar}, autor)`** — devolve as `evento_etapa`
  não-`ok` (`erro`/`bloqueada`/`pendente`, mais as que ficaram `ok` porém sinalizaram
  `revisar`) para `pendente` e **zera `tentativas`**; evento → `pendente`. `forcar` reenfileira
  as etapas 1–6 mesmo se `ok` (a `REGISTRAR` é imutável). 409 se alguma etapa está
  `processando`; 404 se o evento não existe. Grava **1** `ingestao_audit` — exceto no-op
  (evento já todo `ok`, sem `forcar`).
- **`IngestaoAuditService`** — forma canônica `RegistroAuditoria` do core,
  `origem = AJUSTE_MANUAL`, `entidade = "evento_origem"`, **append-only**. Simétrico ao
  `rbac_audit` (004) e ao `clientes_audit` (005). Grava **só o reprocessamento manual** — o
  worker registra seu progresso em `evento_etapa` (log operacional).
- **`EventosQuery`** — leitura do painel: `listar` (filtro por conta/status/tipo/data;
  _default_ `status ∈ {revisar, erro}`; sem `payload_bruto` na lista; ordem `recebido_em
  desc`) e `detalhe` (metadados + `payload_bruto` + `evento_canonico` + as 7 etapas na ordem
  do pipeline).

## HTTP (`backend/src/ingestao/eventos.controller.ts`)

| Método | Rota | Permissão | Notas |
| --- | --- | --- | --- |
| `POST` | `/ingestao/eventos` | `evento:ingerir` | 201 `{eventoId, criado:true}` / 200 `{criado:false}` (dedup) / **422** (corpo ou `EventoCanonico` inválido) |
| `POST` | `/ingestao/eventos/processar` | `evento:reprocessar` | roda `processarPassada()` síncrono → `ResumoPassada`; é o gatilho determinístico dos e2e |
| `POST` | `/ingestao/eventos/{id}/reprocessar` | `evento:reprocessar` | body `{forcar?}`; 200 / 409 (`processando`) / 404 |
| `GET` | `/ingestao/eventos` | `evento:ver` | lista paginada + filtros; `status=todos` remove o filtro default |
| `GET` | `/ingestao/eventos/{id}` | `evento:ver` | detalhe + linha do tempo |

Nenhuma rota `@Public()` / `@AutenticadoBasta()`; **nenhuma** `/webhooks/*` (essas nascem
nos adapters, specs 019–022). 401 (sem token) e 403 (autenticado sem permissão) seguem
distintos, com o corpo genérico da 004.

## Persistência (`prisma/migrations/20260903171321_ingestao/`)

- **`evento_origem`** — PK UUID v7; `plataforma_origem` (enum 7, indexado), `id_origem`
  (texto, **nunca PK**), `tipo_origem`, `payload_bruto` (Json, **imutável**), `evento_canonico`
  (Json?, cache reconstruível), `hash`, `recebido_em`/`ultimo_recebido_em`, `reentregas`,
  `status` (`pendente|ok|erro|revisar`, **derivado** das etapas, indexado com `recebido_em`),
  `classificacao?`, `erro_detalhe?`. `@@unique([plataforma_origem, id_origem, hash])` = a
  regra de dedup (regra inviolável #1).
- **`evento_etapa`** — PK UUID v7; FK `evento_origem_id` (`onDelete: Restrict`), `etapa`
  (enum 7), `status` (`pendente|processando|ok|erro|bloqueada|pulada`, indexado), `resultado`
  (Json?), `erro_detalhe?`, `tentativas`, `executado_em?`. `@@unique([evento_origem_id,
  etapa])` — 1 linha por par.
- **`ingestao_audit`** — forma `RegistroAuditoria` do core, append-only.

A aplicação **nunca** faz `UPDATE` de `payload_bruto`/`hash`/`plataforma_origem`/`id_origem`/
`recebido_em`; só `status`/`classificacao`/`erro_detalhe`/`reentregas`/`ultimo_recebido_em`
mudam depois. Sem _seed_ de negócio.

## Config (`backend/src/config/env.schema.ts`)

| Chave | Default | O quê |
| --- | --- | --- |
| `INGESTAO_WORKER_ENABLED` | `true` | liga o laço de fundo (`false` em teste, via `setup-db.ts` / `ci.yml`) |
| `INGESTAO_WORKER_INTERVALO_MS` | `5000` | intervalo entre passadas |
| `INGESTAO_WORKER_MAX_TENTATIVAS` | `3` | tentativas de uma etapa em `erro` antes de virar `erro` terminal (CL-05) |
| `INGESTAO_WORKER_LOTE` | `50` | máximo de eventos por passada |

## RBAC (spec 004 estendida)

Catálogo (`src/auth/rbac/catalogo.ts`) ganha o recurso **`evento`**: `evento:ver`,
`evento:reprocessar`, `evento:ingerir`. O `administrador` de sistema (via `seed`) e a
credencial de serviço (special-case) concedem as três de graça — sem migração de dados.

## Frontend (`frontend/src/eventos/`)

Item de navegação **Eventos** atrás de `evento:ver` (`usePermissoesEfetivas`); rotas
`/eventos` e `/eventos/:id` sob `<RequirePermissao>`. `EventosListPage` — filtros
(conta/status/tipo) + paginação, _default_ mostrando só `revisar` + `erro` com alternador
"todos". `EventoDetailPage` — cabeçalho, linha do tempo das 7 etapas (status/tentativas/
resultado), `payload_bruto` formatado num `<pre>` com rolagem. `ReprocessarButton` só
aparece com `evento:reprocessar`. `apiFetch` já trata 401 (desloga uma vez) e **403**
(banner, sessão intacta) — nada novo.

## Como o pipeline evolui (specs 018+)

As etapas 2–6 são _no-op_ `pulada` aqui. Uma spec futura chama
`WorkerService.definirExecutor('UPSERT_TRANSACAO', ...)` (ou registra o provider no módulo)
e o worker passa a rodar a lógica real — **sem** alterar `worker.service.ts`,
`plano-passada.ts` nem o schema `evento_etapa`. O grafo de dependências em `etapas.ts` já
garante que `RESOLVER_VINCULO`/`RESOLVER_OFERTA`/`PROJETAR_CONTRATO` só rodem depois de
`UPSERT_TRANSACAO` ficar `ok`, e que a falha de uma etapa isole a jusante (`bloqueada`) sem
afetar as anteriores nem os outros eventos.

## Verificação

- **Backend unit** (sem banco): `hash-evento` (determinismo/estabilidade/`TZ`),
  `evento-canonico` (zod aceita/rejeita), `classificar` (cada regra + `DESCONHECIDO` +
  determinismo), `plano-passada` (`BLOQUEADA`/`ESGOTADA`/status derivado).
- **Backend e2e** (Postgres real, worker desligado): ingestão idempotente + dedup em rajada
  + 422; `processar` leva a `ok`/`revisar`; retry até `MAX` → `erro` terminal; etapa fake
  dependente → `bloqueada` → destrava; falha isolada; 2 passadas concorrentes → 0 efeito
  duplicado; reprocessar zera `tentativas` + 1 auditoria; painel default só `revisar`/`erro`;
  guard 401/403; etapas 2–6 `pulada` com a `especDona` certa; etapa fake substituta é
  chamada sem outra mudança.
- **Regressão**: suítes 003/004/005 verdes sem alteração; `/health` segue com **11**
  contextos. **Frontend**: lista/detalhe, `ReprocessarButton` condicional, 403 não desloga.
- **Portas**: nenhuma nova (backend `3001`, frontend `5174`, Postgres dev `55432`).
