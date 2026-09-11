import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { EtapaIngestao } from '@prisma/client';
import { criarWrapperExterno } from './ingestao/application/executor-externo.wrapper';
import { WorkerService } from './ingestao/application/worker.service';
import { IngestaoModule } from './ingestao/ingestao.module';
import {
  ResolverPessoaEtapaService,
  ResolverVinculoEtapaService,
  UpsertTransacaoEtapaService,
} from './financeiro/application';
import { FinanceiroModule } from './financeiro/financeiro.module';
import { ResolverOfertaEtapaService } from './catalogo/application';
import { CatalogoModule } from './catalogo/catalogo.module';
import { ProjetarContratoEtapaService } from './contratos/application';
import { ContratosModule } from './contratos/contratos.module';

/**
 * Composição do pipeline de ingestão (specs 018/023/024). Mora na **raiz** de
 * `src/` (fora dos dirs de _bounded context_), então é o único lugar que pode
 * importar de `ingestao` **e** `financeiro`/`catalogo` ao mesmo tempo sem
 * violar a regra ESLint `import/no-restricted-paths` — é glue de composição,
 * o análogo de `AppModule`.
 *
 * Registra os executores reais das etapas 2 a 6 do pipeline no `WorkerService`
 * (que a spec 006 deixou como `pulada` + `definirExecutor` como ponto de
 * extensão). Cada _bounded context_ a jusante só implementa o contrato
 * `ExecutorEtapaExterno` do `core` (dados planos); `criarWrapperExterno` (do
 * `ingestao`) adapta para o `Executor` que o worker roda. A spec 025
 * (`PROJETAR_CONTRATO`) fecha as 6 etapas do pipeline canônico da visão 5.3.
 */
@Module({
  imports: [IngestaoModule, FinanceiroModule, CatalogoModule, ContratosModule],
})
export class PipelineWiringModule implements OnModuleInit {
  private readonly logger = new Logger('PipelineWiringModule');

  constructor(
    private readonly worker: WorkerService,
    private readonly resolverPessoa: ResolverPessoaEtapaService,
    private readonly upsertTransacao: UpsertTransacaoEtapaService,
    private readonly resolverVinculo: ResolverVinculoEtapaService,
    private readonly resolverOferta: ResolverOfertaEtapaService,
    private readonly projetarContrato: ProjetarContratoEtapaService,
  ) {}

  onModuleInit(): void {
    for (const svc of [
      this.resolverPessoa,
      this.upsertTransacao,
      this.resolverVinculo,
      this.resolverOferta,
      this.projetarContrato,
    ]) {
      this.worker.definirExecutor(
        svc.etapa as EtapaIngestao,
        criarWrapperExterno(svc),
      );
    }
    this.logger.log(
      'pipeline.ready etapas reais plugadas: RESOLVER_PESSOA, UPSERT_TRANSACAO (spec 018), ' +
        'RESOLVER_VINCULO (spec 024), RESOLVER_OFERTA (spec 023), PROJETAR_CONTRATO (spec 025)',
    );
  }
}
