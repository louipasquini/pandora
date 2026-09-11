# Contrato: `RESOLVER_OFERTA` como `ExecutorEtapaExterno`

Implementa o contrato já existente em `src/core/pipeline/executor-externo.ts` (spec 018) —
**nenhuma mudança nesse arquivo nem no `WorkerService`**.

```ts
class ResolverOfertaEtapaService implements ExecutorEtapaExterno {
  readonly etapa = 'RESOLVER_OFERTA';

  async executar(entrada: EntradaEtapaExterna): Promise<SaidaEtapaExterna> {
    // 1. estratégia = ESTRATEGIA_RESOLUCAO_OFERTA[entrada.plataformaOrigem]
    // 2. estratégia === 'CATALOGO_HOTMART':
    //      buscar oferta_origem_ref(plataforma, 'HOTMART_PRICE_CODE', codigoOrigem)
    //      achou  -> ofertaId; produto? (auto-criação de PRODUTO ainda pode ocorrer
    //                se o catálogo trouxe um codigoProduto novo — só produto, nunca oferta)
    //      não achou -> ofertaId = null, revisar = true, motivo = 'price_code não catalogado'
    // 3. estratégia === 'TAG':
    //      tag = localizarTag({ codigoOrigem, nomeOrigem })  // domain puro
    //      tag == null -> ofertaId = null, revisar = true, motivo = 'tag não localizada'
    //      tag != null -> decodificarTag(tag) -> { codigoProduto, turma, subproduto, ... }
    //                     auto-cria produto (se novo) + oferta + oferta_origem_ref
    //                     (idempotente por @@unique) -> ofertaId
    // 4. UPDATE transacao SET oferta_id = <ofertaId ou null> WHERE id = transacaoId
    //    (transacaoId vem de entrada.resultados.UPSERT_TRANSACAO.transacaoId)
    // 5. return { status: 'ok', resultado: { ofertaId, criada, motivoRevisao }, revisar }
  }
}
```

## Entrada consumida (sem query adicional em `transacao`)

- `entrada.canonico.oferta.codigoOrigem` / `.nomeOrigem`
- `entrada.plataformaOrigem`
- `entrada.resultados.UPSERT_TRANSACAO.transacaoId` (obrigatório — se ausente, a etapa não
  deveria nem rodar, pois `RESOLVER_OFERTA` depende de `UPSERT_TRANSACAO` no grafo de
  `etapas.ts`; ausência é tratada como `erro`, nunca crash silencioso)

## Saída

- `status: 'ok'` sempre que a resolução **rodou** (mesmo sem match — não-match não é erro de
  execução, é um resultado de negócio válido, igual ao `status-map` desconhecido da 018).
- `status: 'erro'` só para falha técnica (ex.: `transacaoId` ausente, violação de constraint
  inesperada).
- `revisar: true` quando `ofertaId` ficou `null` — o `evento_origem.status` derivado (spec
  006) passa a incluir `revisar`, e a spec 018 já expõe `transacao.precisaRevisao`; esta etapa
  também marca `transacao.precisaRevisao = true` + `motivoRevisao` (acumulando com o que a
  etapa 3 já possa ter setado, nunca sobrescrevendo um motivo existente sem adicionar o novo).

## Registro em `pipeline-wiring.module.ts`

```ts
@Module({ imports: [IngestaoModule, FinanceiroModule, CatalogoModule] })
export class PipelineWiringModule implements OnModuleInit {
  constructor(
    private readonly worker: WorkerService,
    private readonly resolverPessoa: ResolverPessoaEtapaService,
    private readonly upsertTransacao: UpsertTransacaoEtapaService,
    private readonly resolverOferta: ResolverOfertaEtapaService, // NOVO
  ) {}

  onModuleInit(): void {
    for (const svc of [this.resolverPessoa, this.upsertTransacao, this.resolverOferta]) {
      this.worker.definirExecutor(svc.etapa as EtapaIngestao, criarWrapperExterno(svc));
    }
  }
}
```

`criarWrapperExterno` (do `ingestao/application/`) é reusado **sem alteração** — já é
genérico para qualquer `ExecutorEtapaExterno`.
