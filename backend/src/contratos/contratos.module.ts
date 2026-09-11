import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { PERMISSOES } from '../auth/rbac/catalogo';
import {
  AjustarContratoService,
  ContratoAuditService,
  ContratoQueryService,
  ProjetarContratoEtapaService,
} from './application';
import { ContratoController } from './contrato.controller';
import { ContratoRepository } from './infra/contrato.repository';

/**
 * `contratos` (spec 025) — 1ª entidade de negócio do _bounded context_ (vazio
 * desde a spec 001). Dono de **`Contrato`** (único por `(pessoa, produto)`,
 * perpétuo) e **`Aditivo`** (projeção derivada de 1 `transacao`).
 *
 * Importa **só** `core` (`ExecutorEtapaExterno`, `Dinheiro`, status canônico,
 * auditoria). **Não** importa `financeiro`/`catalogo` (ESLint
 * `import/no-restricted-paths`) — lê/escreve `transacao`/`oferta`/
 * `oferta_catalogo` direto via `PrismaService` (precedente da spec 023, ver
 * `plan.md` §Complexity Tracking). `CONTEXT_MODULES` segue com 11.
 *
 * `ProjetarContratoEtapaService` é exportado para
 * `src/pipeline-wiring.module.ts` registrá-lo no `WorkerService` via
 * `definirExecutor(...)`.
 */
@Module({
  controllers: [ContratoController],
  providers: [
    ContratoRepository,
    ContratoAuditService,
    ContratoQueryService,
    AjustarContratoService,
    ProjetarContratoEtapaService,
  ],
  exports: [ProjetarContratoEtapaService],
})
export class ContratosModule implements OnModuleInit {
  private readonly logger = new Logger('ContratosModule');

  onModuleInit(): void {
    const perms = PERMISSOES.filter((p) => p.recurso === 'contrato').map((p) => p.id);
    this.logger.log(
      `contratos.ready etapas=[PROJETAR_CONTRATO] permissoes=${perms.length} (${perms.join(', ')})`,
    );
  }
}
