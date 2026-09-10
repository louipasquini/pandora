import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { PERMISSOES } from '../auth/rbac/catalogo';
import {
  ResolverPessoaEtapaService,
  TransacaoQueryService,
  UpsertTransacaoEtapaService,
} from './application';
import { TransacaoRepository } from './infra/transacao.repository';
import { TransacaoController } from './transacao.controller';

/**
 * `financeiro` (spec 018) — 3º _bounded context_ de domínio a ganhar entidade de
 * negócio (`ingestao`/`clientes` são os outros). Dono de **`transacao`** — a
 * projeção normalizada de um evento financeiro, 1 linha por
 * `(plataforma_origem, id_origem)`.
 *
 * Importa **só** `core` (contrato de executor externo, `PortaIdentidade`,
 * `Dinheiro`, `parseInstante`, status canônico). **Não** importa
 * `ingestao`/`clientes` (ESLint `import/no-restricted-paths`). `CONTEXT_MODULES`
 * segue com 11.
 *
 * Os dois executores de etapa (`RESOLVER_PESSOA`, `UPSERT_TRANSACAO`) são
 * exportados para o `FinanceiroWiringModule` (`@Global()`) registrá-los no token
 * multi `EXECUTORES_ETAPA_EXTERNOS` — é assim que o `WorkerService` da `ingestao`
 * os chama sem que os contextos se importem.
 */
@Module({
  controllers: [TransacaoController],
  providers: [
    TransacaoRepository,
    TransacaoQueryService,
    ResolverPessoaEtapaService,
    UpsertTransacaoEtapaService,
  ],
  exports: [ResolverPessoaEtapaService, UpsertTransacaoEtapaService],
})
export class FinanceiroModule implements OnModuleInit {
  private readonly logger = new Logger('FinanceiroModule');

  onModuleInit(): void {
    const perms = PERMISSOES.filter((p) => p.recurso === 'transacao').map((p) => p.id);
    this.logger.log(
      `financeiro.ready etapas=[RESOLVER_PESSOA, UPSERT_TRANSACAO] permissoes=${perms.length} (${perms.join(', ')})`,
    );
  }
}
