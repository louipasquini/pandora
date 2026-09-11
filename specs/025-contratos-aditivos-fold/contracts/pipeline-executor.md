# Contrato: `ProjetarContratoEtapaService` (etapa `PROJETAR_CONTRATO`, ordem 6)

Implementa `ExecutorEtapaExterno` do `core` (contrato já existente desde a spec 018).
Registrado em `src/pipeline-wiring.module.ts` via `WorkerService.definirExecutor(...)`.

## Entrada

`entrada.resultados.UPSERT_TRANSACAO.transacaoId` (obrigatório — se ausente, `erro`, mesmo
padrão de `ResolverOfertaEtapaService`).

## Passos

1. Carrega a `transacao` (id, `pessoaId`, `ofertaId`, `classificacao`, `statusCanonico`,
   `valorBrutoInt/Moeda`, `valorLiquidoInt/Moeda`, `ocorridoEm`, `contratoId` atual) via
   `PrismaService` direto (ver Complexity Tracking do `plan.md`).
2. `classificacao ∉ {VENDA_PROPRIA, RECORRENCIA, REEMBOLSO}` → `status: 'pulada'`,
   `resultado: { motivo: 'classificação não gera aditivo' }`.
3. `pessoaId == null` → `status: 'ok'`, `revisar: false` (a etapa 2 já trata isso como
   resultado válido e não-revisável quando não há nenhum dado de identidade — esta etapa
   espelha a mesma leniência, sem acrescentar um motivo de revisão novo),
   `resultado: { contratoId: null, motivo: 'pessoa não resolvida' }` — reprocessável a
   qualquer hora, se/quando um re-sync trouxer dados de identidade.
4. `ofertaId == null` → mesmo formato (`revisar: false` — a etapa 5 já marca o evento para
   revisão sozinha quando não resolve; esta etapa só observa a consequência, não duplica o
   sinal), `motivo: 'oferta não resolvida — produto do contrato desconhecido'`.
5. Carrega `oferta.produtoId` + `oferta_catalogo.tempoAcessoDias` (podem ser `null` se a
   curadoria de `tempo_acesso` ainda não foi feita — trata-se no fold, passo 4 do
   `data-model.md`, não aqui).
6. `getOrCreateContrato(pessoaId, produtoId)` — `INSERT ... ON CONFLICT` com fallback de
   corrida (mesmo padrão de `VinculoRepository.criarVinculo`/024: tenta criar, em `P2002`
   recarrega o existente).
7. Se `transacao.contratoId` ainda não aponta para este contrato, grava
   `transacao.contratoId = contrato.id` (nunca muda depois de gravado — 1 transação nunca
   migra de contrato).
8. Carrega **todas** as transações com `contratoId = contrato.id` (fresco, inclui a atual) +
   `oferta.tempoAcessoDias` de cada uma.
9. Roda `fold(transacoes)` (puro, `contratos/domain/fold.ts`).
10. `upsert` de cada `Aditivo` (por `transacaoId`) com o `rotulo`/`fimAcessoResultante`/
    `precisaRevisao`/`motivoRevisao` calculados.
11. `UPDATE contrato SET fimAcesso, ticketTotal, valorRecebido,
    ajusteManualStatus = NULL, ajusteManualEm = NULL, ajusteManualAutor = NULL,
    ajusteManualMotivo = NULL` — o `SET NULL` do ajuste manual é incondicional: CL-01 do spec
    confirma que **qualquer** novo aditivo limpa o override, mesmo que o novo aditivo não
    altere `fimAcesso` (ex.: uma tentativa `RECUSADA`).
12. Devolve `status: 'ok'`, `resultado: { contratoId, fimAcesso, rotulo: <desta transação>,
    ticketTotal, valorRecebido }`, `revisar: <precisaRevisao deste aditivo>`.

## Saída (forma)

```ts
type SaidaProjetarContrato =
  | { status: 'pulada'; resultado: { motivo: string } }
  | {
      status: 'ok';
      revisar: boolean;
      resultado: {
        contratoId: string | null;
        fimAcesso: string | null; // ISO
        rotulo?: 'COMPRA_INICIAL' | 'RENOVACAO' | 'PRORROGACAO' | 'REEMBOLSO' | 'SEM_EFEITO';
        ticketTotal?: Record<string, string>;
        valorRecebido?: Record<string, string>;
        motivo?: string; // presente quando contratoId é null
      };
    };
```

## Idempotência

Reprocessar a mesma transação (mesmo evento reentregue, ou etapa reexecutada manualmente)
produz exatamente o mesmo `Aditivo` (upsert por `transacaoId`) e o mesmo `fimAcesso`/
`ticketTotal`/`valorRecebido` (fold puro sobre o mesmo conjunto de transações) — 0 duplicação,
0 divergência (SC-002 do spec).
