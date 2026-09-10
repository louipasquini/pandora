import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { EtapaIngestao } from '@prisma/client';
import { criarWrapperExterno } from './ingestao/application/executor-externo.wrapper';
import { WorkerService } from './ingestao/application/worker.service';
import { IngestaoModule } from './ingestao/ingestao.module';
import {
  ResolverPessoaEtapaService,
  UpsertTransacaoEtapaService,
} from './financeiro/application';
import { FinanceiroModule } from './financeiro/financeiro.module';

/**
 * Composição do pipeline de ingestão (spec 018). Mora na **raiz** de `src/`
 * (fora dos dirs de _bounded context_), então é o único lugar que pode importar
 * de `ingestao` **e** `financeiro` ao mesmo tempo sem violar a regra ESLint
 * `import/no-restricted-paths` — é glue de composição, o análogo de `AppModule`.
 *
 * Registra os executores reais das etapas 2–3 do pipeline no `WorkerService`
 * (que a spec 006 deixou como `pulada` + `definirExecutor` como ponto de
 * extensão). O `financeiro` só implementa o contrato `ExecutorEtapaExterno` do
 * `core` (dados planos); `criarWrapperExterno` (do `ingestao`) adapta para o
 * `Executor` que o worker roda. Specs 023–025 acrescentam suas etapas aqui.
 */
@Module({
  imports: [IngestaoModule, FinanceiroModule],
})
export class PipelineWiringModule implements OnModuleInit {
  private readonly logger = new Logger('PipelineWiringModule');

  constructor(
    private readonly worker: WorkerService,
    private readonly resolverPessoa: ResolverPessoaEtapaService,
    private readonly upsertTransacao: UpsertTransacaoEtapaService,
  ) {}

  onModuleInit(): void {
    for (const svc of [this.resolverPessoa, this.upsertTransacao]) {
      this.worker.definirExecutor(
        svc.etapa as EtapaIngestao,
        criarWrapperExterno(svc),
      );
    }
    this.logger.log(
      'pipeline.ready etapas reais plugadas: RESOLVER_PESSOA, UPSERT_TRANSACAO (spec 018)',
    );
  }
}
