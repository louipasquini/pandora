import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PERMISSOES } from '../auth/rbac/catalogo';
import { CrmAdminController } from './crm-admin.controller';
import { LeadController } from './lead.controller';
import { CampoPersonalizadoController } from './campo-personalizado.controller';
import { EquipeRepository } from './infra/equipe.repository';
import { ExpedienteRepository } from './infra/expediente.repository';
import { IntegracaoRepository } from './infra/integracao.repository';
import { CrmAdminAuditService } from './application/crm-admin-audit.service';
import { EquipeService } from './application/equipe.service';
import { ExpedienteService } from './application/expediente.service';
import { IntegracaoService } from './application/integracao.service';
import { LeadRepository } from './infra/lead/lead.repository';
import { CampoPersonalizadoRepository } from './infra/lead/campo-personalizado.repository';
import { ValorCampoRepository } from './infra/lead/valor-campo.repository';
import { CrmLeadAuditService } from './application/lead/crm-lead-audit.service';
import { LeadConsultaService } from './application/lead/lead-consulta.service';
import { LeadScoreService } from './application/lead/lead-score.service';
import { LeadService } from './application/lead/lead.service';
import { LeadConversaoService } from './application/lead/lead-conversao.service';
import { CampoPersonalizadoService } from './application/lead/campo-personalizado.service';
import { ValorCampoService } from './application/lead/valor-campo.service';
import { RegistrarLeadService } from './application/lead/registrar-lead.service';

/**
 * `crm` — bounded context de domínio (specs 007 + 008). Dono de `equipe`,
 * `janela_atendimento`, `feriado`, `integracao` (007) e de **`lead`** (008 — a
 * 1ª entidade compartilhada do projeto; acesso por RBAC 004).
 *
 * Importa `core` (global), `auth` (infra transversal — guard, `Permissao`,
 * `SujeitoRbacService` para o escopo de visão do lead) e o token `PORTA_IDENTIDADE`
 * do `core` (provido pelo `IdentidadeWiringModule` `@Global()` da 005 —
 * inversão de dependência, **sem** importar `src/clientes/**`).
 *
 * **Exporta `RegistrarLeadService`** — porta in-process para a spec 035.
 * `CONTEXT_MODULES` segue com 11.
 */
@Module({
  imports: [AuthModule],
  controllers: [CrmAdminController, LeadController, CampoPersonalizadoController],
  providers: [
    // 007
    EquipeRepository,
    ExpedienteRepository,
    IntegracaoRepository,
    CrmAdminAuditService,
    EquipeService,
    ExpedienteService,
    IntegracaoService,
    // 008
    LeadRepository,
    CampoPersonalizadoRepository,
    ValorCampoRepository,
    CrmLeadAuditService,
    LeadConsultaService,
    LeadScoreService,
    LeadService,
    LeadConversaoService,
    CampoPersonalizadoService,
    ValorCampoService,
    RegistrarLeadService,
  ],
  exports: [RegistrarLeadService],
})
export class CrmModule implements OnModuleInit {
  private readonly logger = new Logger('CrmModule');

  onModuleInit(): void {
    const admin = PERMISSOES.filter((p) => p.recurso === 'crm_admin').map((p) => p.id);
    const lead = PERMISSOES.filter((p) => p.recurso === 'lead').map((p) => p.id);
    this.logger.log(
      `crm.ready crm_admin=${admin.length} lead=${lead.length} (${[...admin, ...lead].join(', ')})`,
    );
  }
}
