# Research: Catálogo — `produto` → `oferta`

## R1 — Ponto de extensão do pipeline (etapa 5) já existe, não precisa de contrato novo

`src/core/pipeline/executor-externo.ts` (criado na spec 018) já define
`ExecutorEtapaExterno`/`EntradaEtapaExterna`/`SaidaEtapaExterna`, e
`src/pipeline-wiring.module.ts` já importa `IngestaoModule` + `FinanceiroModule` e registra 2
executores via `worker.definirExecutor(...)` no `onModuleInit`. `etapas.ts` já declara
`RESOLVER_OFERTA` (ordem 5, `especDona: 23`, depende só de `UPSERT_TRANSACAO`).

**Decisão**: `catalogo` implementa um 3º `ExecutorEtapaExterno` (`etapa: 'RESOLVER_OFERTA'`);
`pipeline-wiring.module.ts` ganha `imports: [..., CatalogoModule]` e mais uma entrada no loop
`for (const svc of [...])`. **Nenhuma mudança em `WorkerService`/`etapas.ts`/`EtapaCtx`.**

## R2 — Dados disponíveis na entrada do executor (sem reconsultar `transacao`)

`EntradaEtapaExterna.canonico` é o `EventoCanonico` completo (schema `core/pipeline/evento-canonico.ts`),
incluindo `oferta?: { codigoOrigem?, nomeOrigem?, quantidade? }` e `ocorridoEm: string`. Não é
preciso um novo `SELECT` em `transacao` para ler esses campos — eles já chegam na entrada.//
O `transacaoId` (necessário para o `UPDATE transacao SET oferta_id = ...`) vem de
`entrada.resultados.UPSERT_TRANSACAO.transacaoId` (o `resultado` gravado pela etapa 3, spec
018 — confirmado lendo `upsert-transacao-etapa.service.ts`).

**Decisão**: o executor de `RESOLVER_OFERTA` não faz nenhuma leitura de `transacao` — só
`entrada.canonico`, `entrada.plataformaOrigem`, `entrada.resultados.UPSERT_TRANSACAO.transacaoId`.

## R3 — Campos brutos de oferta por adapter (auditoria de código, specs 019–022)

Levantamento em `src/ingestao/adapters/{tmb,asaas,guru,hotmart}/*.ts`:

| Plataforma | `oferta.codigoOrigem` | `oferta.nomeOrigem` |
| --- | --- | --- |
| TMB | nunca preenchido | `p.titulo ?? p.code` (Vendas/API) / `d.produto` (Financeiro) |
| Asaas | nunca preenchido | `payment.description` |
| Guru | `product.offer.id ?? items[0].offer.id` (no checkout Guru, o time da AEN pode nomear o ID da oferta livremente — na prática, é a própria tag) | `offer.name ?? product.name` |
| Hotmart | `offer.code` (o "código do preço" opaco da Hotmart) | `offer.name` |

**Implicação**: não existe, hoje, nenhuma plataforma com um campo *estruturalmente* dedicado
só para a tag AEN — o "ancorado" é uma **propriedade do valor** (`codigoOrigem` casa o formato
exato de 8 chars), não uma característica fixa por plataforma. Isso justifica D-02 do spec.md:
os 2 localizadores são estratégias genéricas sobre os mesmos 2 campos, não branches por nome
de plataforma. A Hotmart nunca chega a essa lógica (D-03 — estratégia dedicada).

## R4 — Sentinelas de turma documentados na análise da v1 (visão, seção 4.8)

`TURMA_EVERGREEN = "X0"`; `estrategia = "Perpétuo" if turma == "00"`. São os únicos 2 valores
sentinela com significado documentado no projeto (o resto do mapeamento caractere→significado
de `subproduto`/`modelo_cobranca`/`modelo_transacao` não está em lugar nenhum do repositório —
ver spec.md D-01/Assumptions).

**Decisão**: `decodificarTag` interpreta os 2 caracteres de turma como: `"X0"` → `EVERGREEN`,
`"00"` → `PERPETUO`, `/^\d{2}$/` → `NUMERO` (valor numérico), qualquer outra coisa →
`DESCONHECIDO` (preservado cru, marca revisão).

## R5 — Formato da tag e regex de localização

Visão, glossário: tag de 8 caracteres (`PCS48XAV`), string no **início** do nome da oferta,
prefixada por `#` dentro de colchetes (`[#PCS48XAV] ...`). Regex de forma exata:
`^[A-Z]{3}[A-Z0-9]{5}$` (produto 3 letras maiúsculas + 5 chars alfanuméricos maiúsculos —
turma+subproduto+cobrança+transação). Regex de localização em texto livre:
`#([A-Z]{3}[A-Z0-9]{5})\b` (primeiro match vence, D-02/Edge Cases).

## R6 — Ambiente de teste: sem necessidade de container novo

Diferente das specs 019–022 (que rodaram em paralelo com outras sessões e precisaram de
containers Postgres isolados por porta), esta sessão tem **só** `pandora-db` (porta `55432`)
ativo — `docker ps` confirmado em 2026-09-11. `TEST_DATABASE_URL` do `.env` da raiz já aponta
pra ele (`.../pandora_test`), e `test/setup-db.ts` já isola cada execução por **schema**
Postgres dentro desse mesmo banco (`t_<timestamp>_<random>`), não por porta. **Decisão**:
reusar o `pandora-db` existente — nenhum container novo, nenhuma porta nova.

## R7 — `oferta_catalogo` exclusivo por oferta (CL-01)

Resolvido diretamente com o dono do produto (ver spec.md Clarifications) — "Por oferta (1:1
direto)": cada `oferta` (1 por `(tag, plataforma)`) tem seu próprio `oferta_catalogo`, mesmo
quando duas ofertas de plataformas diferentes compartilham a tag AEN.

## R8 — Escopo do CSV Hotmart: 3 arquivos, não 4

A visão v1 (seção 2.4) lista 4 CSVs (`produtos.csv`, `ofertas.csv`, `lancamentos.csv`,
`afiliados.csv`). `afiliados.csv` popula `ProdutoAfiliado` — entidade do domínio da spec
**026** ("vendas-como-afiliada", ROADMAP.md), fora do escopo desta spec (D-11). As colunas
exatas dos 3 CSVs não têm um arquivo de exemplo real disponível neste repositório — o schema
de colunas usado (`data-model.md`) é uma proposta razoável, documentada, seguindo o padrão
`aliases pt-BR/inglês` já usado pelos parsers de CSV das specs 019–022; o time de operações
adapta a exportação real ao schema documentado (ver Assumptions do spec.md).
