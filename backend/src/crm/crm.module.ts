import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { PERMISSOES } from '../auth/rbac/catalogo';
import { CrmAdminController } from './crm-admin.controller';
import { EquipeRepository } from './infra/equipe.repository';
import { ExpedienteRepository } from './infra/expediente.repository';
import { IntegracaoRepository } from './infra/integracao.repository';
import { CrmAdminAuditService } from './application/crm-admin-audit.service';
import { EquipeService } from './application/equipe.service';
import { ExpedienteService } from './application/expediente.service';
import { IntegracaoService } from './application/integracao.service';

/**
 * `crm` (spec 007) — 3º _bounded context_ de domínio a ganhar entidade de
 * negócio. Dono de `equipe`, `janela_atendimento`, `feriado` e `integracao`.
 * Importa só `core` (global) e tipos de `auth` (infra transversal — o
 * decorator/`Permissao`); **não** importa `clientes`/`financeiro`/`ingestao`/
 * `catalogo`/`contratos`/`marketing`/`central` (ESLint `import/no-restricted-paths`).
 * `CONTEXT_MODULES` segue com 11.
 *
 * Não exporta porta — 010/012/014 decidem a forma de consumir `equipe` /
 * `estaEmExpediente` quando chegarem.
 */
@Module({
  controllers: [CrmAdminController],
  providers: [
    EquipeRepository,
    ExpedienteRepository,
    IntegracaoRepository,
    CrmAdminAuditService,
    EquipeService,
    ExpedienteService,
    IntegracaoService,
  ],
})
export class CrmModule implements OnModuleInit {
  private readonly logger = new Logger('CrmModule');

  onModuleInit(): void {
    const ids = PERMISSOES.filter((p) => p.recurso === 'crm_admin').map((p) => p.id);
    this.logger.log(`crm.ready crm_admin permissoes=${ids.length} (${ids.join(', ')})`);
  }
}
