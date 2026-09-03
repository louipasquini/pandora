# Research — spec 006 · evento_origem e worker de ingestão

Todas as questões de `NEEDS CLARIFICATION` foram resolvidas no `/speckit-clarify`
(CL-01…CL-05, spec §Clarifications). Este documento registra as decisões **técnicas** de
como implementar dentro dessas respostas.

---

## D1 — Agendamento do worker: `setInterval` in-house vs `@nestjs/schedule`

**Decisão**: `setInterval` in-house num provider (`worker.scheduler.ts`) com
`OnModuleInit`/`OnModuleDestroy`, ligado/desligado por `INGESTAO_WORKER_ENABLED`.

**Racional**:
- O projeto já implementa infra transversal à mão quando cabe em poucas linhas: _rate
  limit_ por IP (003, `rate-limit.guard.ts`), validação de DV de CPF/CNPJ e E.164 (005).
  O agendamento é ~30 linhas (`setInterval` + _flag_ de reentrância + `clearInterval` no
  _destroy_).
- `@nestjs/schedule` traz `cron` como dependência transitiva e exige `ScheduleModule.forRoot()`
  global — superfície desraproporcional para um único laço.
- O gatilho **determinístico** dos e2e é o endpoint `POST /ingestao/eventos/processar` (e o
  provider `WorkerService.processarPassada()` injetável direto no teste) — não depende do
  agendador. Em `NODE_ENV=test` o agendador nem liga.

**Alternativas consideradas**:
- `@nestjs/schedule` `@Interval()` — rejeitado (1 dep + módulo global).
- Processo worker separado (`npm run worker`) — rejeitado no CL-01 pelo dono do produto.
- BullMQ / fila Redis — rejeitado: introduz Redis (porta nova, infra), e o CL-01 pediu
  "sem infra nova". O volume da AEN não exige.

---

## D2 — Concorrência: garantir "cada evento/etapa processado ≤ 1× por passada"

**Decisão**: seleção com `SELECT … FOR UPDATE SKIP LOCKED` (via `prisma.$queryRaw` dentro
de uma transação curta) para **reservar** um lote de `evento_origem` elegíveis; cada evento
é então processado numa transação própria; cada etapa numa sub-transação própria. Um _flag_
booleano no `scheduler` evita que dois _ticks_ do `setInterval` se sobreponham no mesmo
processo.

**Racional**:
- `SKIP LOCKED` é o padrão Postgres para fila sem contenção — dois workers (ou dois _ticks_)
  pegam lotes disjuntos sem erro nem espera.
- Prisma não expõe `FOR UPDATE` no _query builder_; `$queryRaw` com um `SELECT id …` é
  suficiente (retorna só os ids a processar; o resto é Prisma normal).
- Idempotência das etapas (D6) cobre o caso raro de reprocessamento acidental.

**Alternativas**: _advisory locks_ (`pg_try_advisory_lock`) — mais frágil de liberar em
falha; coluna `reservado_em`/`reservado_por` com _timeout_ — reinventa `SKIP LOCKED`.

---

## D3 — `hashEvento`: forma e estabilidade

**Decisão**: `hashEvento(payloadBruto: unknown): string` = `sha256(canonicalize(payloadBruto))`
em hex, onde `canonicalize` serializa JSON com **chaves ordenadas recursivamente** e sem
espaço. `node:crypto` (nativo). Não entra `plataforma_origem`/`id_origem` no hash — eles já
compõem a chave única `(plataforma_origem, id_origem, hash)`.

**Racional**: reentrega byte-idêntica ou com chaves reordenadas → mesmo hash → dedup
(FR-002/003). Payload materialmente diferente para o mesmo `id_origem` → hash diferente →
evento novo (ambos preservados; reconciliação é da etapa _upsert_, spec 018). Livre de
_locale_/`TZ` porque opera sobre a estrutura JSON, não sobre texto formatado.

**Alternativas**: hash do texto cru recebido — rejeitado (espaço/ordem de chaves geraria
falsos "eventos novos"). `JSON.stringify` sem ordenar — idem.

---

## D4 — Contrato `EventoCanonico`: campos obrigatórios vs opcionais

**Decisão**: schema `zod` com um **núcleo obrigatório mínimo** e o resto opcional nesta
spec, a ser apertado pela 018 quando a etapa `RESOLVER_PESSOA`/`UPSERT_TRANSACAO` deixar de
ser _no-op_:

Obrigatórios: `plataformaOrigem` (enum 7), `idOrigem` (string não vazia), `tipoOrigem`
(string), `statusOrigem` (string cru), `ocorridoEm` (instante via `parseInstante`, pode
resolver `null` com motivo — registrado, não rejeitado).

Opcionais (aceitos e transportados; validados se presentes): `comprador`
(`{ nome?, emails?[], telefones?[], documentos?[], endereco? }`), `valores`
(`{ bruto?: Dinheiro, liquido?: Dinheiro, ... }` — cada um `{ valorInteiro: bigint, moeda }`),
`oferta` (`{ codigoOrigem?, ... }` crus), `assinatura` (`{ ehRecorrencia?: boolean,
ciclo
?, ... }`), `ehAfiliada` (boolean), `referenciaExterna`
(`{ plataforma?, idOrigem? }` — ponte p/ a etapa 4), `classificacao` (enum `Classificacao`,
preliminar).

**Racional**: nesta spec a única etapa que **consome** o canônico é `CLASSIFICAR`, que só
precisa de `statusOrigem`/`tipoOrigem`/`ehAfiliada`/`referenciaExterna`/`assinatura`/
`classificacao`. Exigir dados de comprador agora bloquearia eventos legítimos sem comprador
(afiliada) e anteciparia decisão da 018.

**Alternativas**: contrato "fechado" já com tudo obrigatório — rejeitado (Princípio II:
antecipa regra da 018). Sem contrato, só `payload_bruto` — rejeitado (o pedido do dono do
produto e a visão 5.2 pedem `EventoCanonico` explícito).

---

## D5 — Registro de etapas e grafo de dependências

**Decisão**: `ETAPAS` é um array ordenado de objetos
`{ nome, ordem, dependeDe: EtapaIngestao[], especDona: number, executar(ctx) }`. Grafo:

| Etapa | ordem | dependeDe | espec dona | nesta spec |
|---|---|---|---|---|
| `REGISTRAR` | 0 | — | 006 | feito na porta de ingestão (não roda no worker) |
| `CLASSIFICAR` | 1 | `REGISTRAR` | 006 | **real** |
| `RESOLVER_PESSOA` | 2 | `CLASSIFICAR` | 018 | _no-op_ `pulada` |
| `UPSERT_TRANSACAO` | 3 | `RESOLVER_PESSOA` | 018 | _no-op_ `pulada` |
| `RESOLVER_VINCULO` | 4 | `UPSERT_TRANSACAO` | 024 | _no-op_ `pulada` |
| `RESOLVER_OFERTA` | 5 | `UPSERT_TRANSACAO` | 023 | _no-op_ `pulada` |
| `PROJETAR_CONTRATO` | 6 | `UPSERT_TRANSACAO` | 025 | _no-op_ `pulada` |

`RESOLVER_PESSOA` "usa `null` e segue" na visão — modelado como etapa que **nunca bloqueia
a jusante por si só** (uma _no-op_ que resolve `pulada`/`ok`); a dependência dura de 4/5/6 é
`UPSERT_TRANSACAO`. Uma spec futura troca a entrada do `ETAPAS` pela implementação real; o
`worker.service.ts` e `plano-passada.ts` não mudam.

**Racional**: dependência **declarada como dado** (não `if` espalhado) deixa `plano-passada`
puro e testável, e o encaixe plugável (US5) trivial.

---

## D6 — Idempotência e retry (CL-05)

**Decisão**:
- Cada `executar(ctx)` de etapa é escrito para ser idempotente (a _no-op_ é trivialmente;
  `CLASSIFICAR` só faz `UPDATE` de `classificacao`/`status`, idempotente).
- `evento_etapa.tentativas` incrementa a cada execução que termina `erro`. O worker
  seleciona etapas `pendente`, `bloqueada` (com dependência agora `ok`) e `erro` com
  `tentativas < INGESTAO_WORKER_MAX_TENTATIVAS` (default 3).
- Esgotado `MAX`, a etapa fica `erro` **terminal**; só `/reprocessar` (que zera
  `tentativas`) a reativa.
- `evento_etapa` é **uma linha por `(evento, etapa)`** com `tentativas` como contador — não
  há histórico por tentativa (mantém o schema enxuto; a linha do tempo do painel mostra o
  estado atual + `tentativas` + `executadoEm`).

**Alternativas**: histórico append-only por tentativa — rejeitado (schema maior, sem
benefício de operação na v1; spec 029/053 consolidam telemetria). Retry infinito (minha
recomendação no clarify) — **rejeitado pelo dono do produto** (CL-05) em favor do limite.

---

## D7 — Auditoria: `ingestao_audit` própria

**Decisão**: tabela `ingestao_audit` própria, mesma forma canônica do `core`
(`RegistroAuditoria` via `montarRegistroAuditoria`), `origem = AJUSTE_MANUAL`, _append-only_
— simétrica ao `rbac_audit` (004) e ao `clientes_audit` (005). Grava **só o reprocessamento
manual** (quem, quando, `eventoId`, etapas reenfileiradas, `forcar`).

**Racional**: consistência com o padrão já estabelecido em 004/005; o worker **não** audita
(seu log é `evento_etapa`, operacional). Painel consolidado de auditoria = spec 053.

**Alternativas**: reusar uma tabela `_audit` global — não existe ainda (053); gravar em
`evento_etapa` — mistura log operacional com trilha de auditoria humana.

---

## D8 — Endpoint `/processar` como gatilho

**Decisão**: `POST /ingestao/eventos/processar` sob `evento:reprocessar`, **síncrono** —
roda `processarPassada()` e devolve `ResumoPassada` (`{ selecionados, ok, revisar, erro,
bloqueadas, duracaoMs }`). É o gatilho dos e2e e um "rodar agora" para operação.

**Racional**: e2e determinístico sem depender do `setInterval`. Mesma permissão que
`reprocessar` (é operação de worker, não ingestão de dado).

**Alternativas**: expor só via provider de teste — rejeitado (operação real também quer um
"rodar agora"). Sob `evento:ingerir` — semântica errada.

---

## D9 — `payload_bruto` não-JSON e limites

**Decisão**: a porta exige `payloadBruto` **JSON-serializável** (objeto/array/escalar); não
serializável → `422` ao chamador, nada persistido. Sem teto de tamanho explícito na v1
(`jsonb` do Postgres suporta; política de tamanho/retenção = spec 055). Webhook real que
entrega corpo inválido e ainda assim precisa virar `evento_origem` é problema do adapter
(019) — ele decide se sintetiza um envelope.

---

## D10 — Frontend: reuso total de 003/004

**Decisão**: `frontend/src/eventos/` segue o molde de `frontend/src/pessoas/` (005):
`nav-items.ts` com `requerPermissao: 'evento:ver'`; rotas sob `<RequirePermissao>`;
`eventos-api.ts` usa o `apiFetch` central (injeta `Authorization`, trata 401 e 403 num
ponto único — banner, sem deslogar). `test/setup.ts` ganha resposta _default_ para
`/ingestao/eventos`. **0 dep nova**, nenhum mecanismo novo.
