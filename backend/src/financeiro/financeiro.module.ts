import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { PERMISSOES } from '../auth/rbac/catalogo';
import {
  ResolverPessoaEtapaService,
  ResolverVinculoEtapaService,
  TentarVincularService,
  TransacaoQueryService,
  UpsertTransacaoEtapaService,
} from './application';
import { TransacaoRepository } from './infra/transacao.repository';
import { VinculoRepository } from './infra/vinculo.repository';
import { TransacaoController } from './transacao.controller';

/**
 * `financeiro` (spec 018 + 024) — 3º _bounded context_ de domínio a ganhar
 * entidade de negócio (`ingestao`/`clientes` são os outros). Dono de
 * **`transacao`** — a projeção normalizada de um evento financeiro, 1 linha por
 * `(plataforma_origem, id_origem)` — e de **`vinculo_transacao`** (spec 024).
 *
 * Importa **só** `core` (contrato de executor externo, `PortaIdentidade`,
 * `Dinheiro`, `parseInstante`, status canônico). **Não** importa
 * `ingestao`/`clientes` (ESLint `import/no-restricted-paths`). `CONTEXT_MODULES`
 * segue com 11.
 *
 * Os 3 executores de etapa (`RESOLVER_PESSOA`, `UPSERT_TRANSACAO`,
 * `RESOLVER_VINCULO`) são exportados para `src/pipeline-wiring.module.ts` (módulo
 * de composição na raiz) registrá-los no `WorkerService` via
 * `definirExecutor(...)` — é assim que o worker da `ingestao` os chama sem que
 * os contextos se importem.
 */
@Module({
  controllers: [TransacaoController],
  providers: [
    TransacaoRepository,
    VinculoRepository,
    TransacaoQueryService,
    TentarVincularService,
    ResolverPessoaEtapaService,
    UpsertTransacaoEtapaService,
    ResolverVinculoEtapaService,
  ],
  exports: [ResolverPessoaEtapaService, UpsertTransacaoEtapaService, ResolverVinculoEtapaService],
})
export class FinanceiroModule implements OnModuleInit {
  private readonly logger = new Logger('FinanceiroModule');

  onModuleInit(): void {
    const perms = PERMISSOES.filter((p) => p.recurso === 'transacao').map((p) => p.id);
    this.logger.log(
      `financeiro.ready etapas=[RESOLVER_PESSOA, UPSERT_TRANSACAO, RESOLVER_VINCULO] permissoes=${perms.length} (${perms.join(', ')})`,
    );
  }
}
