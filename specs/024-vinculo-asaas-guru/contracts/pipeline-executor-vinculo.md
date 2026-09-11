# Contract: `ResolverVinculoEtapaService` (etapa 4 — `RESOLVER_VINCULO`)

Implementa `ExecutorEtapaExterno` do `core` (`src/core/pipeline/executor-externo.ts`, contrato
já existente desde a spec 018 — sem alteração). Registrado em `src/pipeline-wiring.module.ts`
junto dos executores das etapas 2/3/5.

```ts
readonly etapa = 'RESOLVER_VINCULO';

async executar(entrada: EntradaEtapaExterna): Promise<SaidaEtapaExterna>
```

## Entrada relevante

- `entrada.plataformaOrigem` — decide o ramo (Asaas / Guru / não aplicável).
- `entrada.canonico?.referenciaExterna?.idOrigem` — só lido no ramo Asaas, na **primeira**
  vez que a transação passa pela etapa (a persistência em `transacao.referencia_externa_id_origem`
  já aconteceu na etapa 3 — este executor não depende de reler o canônico para reprocessar,
  só para a 1ª tentativa síncrona).
- `entrada.resultados.UPSERT_TRANSACAO.transacaoId` — id da transação já upsertada (mesmo
  padrão da 023).

## Saída

- Ramo **Asaas sem referência externa** ou **plataforma não Asaas/Guru**: `{ status:
  'pulada' }`.
- Ramo **Asaas com referência externa, Guru pareada encontrada**: `{ status: 'ok', resultado:
  { papel: 'ASAAS', vinculado: true, transacaoVinculadaId, vinculoId } }`.
- Ramo **Asaas com referência externa, Guru pareada não encontrada (ainda)**: `{ status: 'ok',
  resultado: { papel: 'ASAAS', vinculado: false } }` — **nunca** `erro`, **nunca**
  `revisar: true` (pendente é estado válido).
- Ramo **Guru, resolveu 0+ pendentes**: `{ status: 'ok', resultado: { papel: 'GURU',
  pendentesResolvidas: number } }`.

## Idempotência

Reprocessar o mesmo evento (via `/reprocessar`) faz o executor rodar de novo; como
`TentarVincularService` verifica o vínculo existente antes de criar, o resultado é o mesmo
(no-op se já vinculado) — nenhum `vinculo_transacao` duplicado, nenhuma segunda reclassificação.
