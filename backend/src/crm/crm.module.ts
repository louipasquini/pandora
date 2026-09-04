import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PERMISSOES } from '../auth/rbac/catalogo';
import { CrmAdminController } from './crm-admin.controller';
import { LeadController } from './lead.controller';
import { CampoPersonalizadoController } from './campo-personalizado.controller';
import { InteracaoController } from './interacao.controller';
import { PessoaTagController } from './pessoa-tag.controller';
import { TagController } from './tag.controller';
import { SegmentoController } from './segmento.controller';
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
import { InteracaoRepository } from './infra/interacao/interacao.repository';
import { TagRepository } from './infra/tag/tag.repository';
import { TagAssociacaoRepository } from './infra/tag/tag-associacao.repository';
import { SegmentoRepository } from './infra/segmento/segmento.repository';
import { CrmInteracaoAuditService } from './application/interacao/crm-interacao-audit.service';
import { InteracaoService } from './application/interacao/interacao.service';
import { RegistrarInteracaoService } from './application/interacao/registrar-interacao.service';
import { TagService } from './application/tag/tag.service';
import { SegmentoService } from './application/segmento/segmento.service';
import { PipelineController } from './pipeline.controller';
import { OportunidadeController } from './oportunidade.controller';
import { CampoOportunidadeController } from './campo-oportunidade.controller';
import { PipelineRepository } from './infra/pipeline/pipeline.repository';
import { OportunidadeRepository } from './infra/pipeline/oportunidade.repository';
import { MovimentacaoRepository } from './infra/pipeline/movimentacao.repository';
import { RegraAtribuicaoRepository } from './infra/pipeline/regra-atribuicao.repository';
import { CampoOportunidadeRepository } from './infra/pipeline/campo-oportunidade.repository';
import { ValorCampoOportunidadeRepository } from './infra/pipeline/valor-campo-oportunidade.repository';
import { CrmPipelineAuditService } from './application/pipeline/crm-pipeline-audit.service';
import { PipelineService } from './application/pipeline/pipeline.service';
import { AtribuicaoService } from './application/pipeline/atribuicao.service';
import { OportunidadeService } from './application/pipeline/oportunidade.service';
import { OportunidadeConsultaService } from './application/pipeline/oportunidade-consulta.service';
import { MoverOportunidadeService } from './application/pipeline/mover-oportunidade.service';
import { CampoOportunidadeService } from './application/pipeline/campo-oportunidade.service';
import { ValorCampoOportunidadeService } from './application/pipeline/valor-campo-oportunidade.service';
import { MetricasService } from './application/pipeline/metricas.service';
import { PortaObservacaoPagamentoService } from './application/pipeline/porta-observacao-pagamento.service';
import { WhatsappAdminController } from './whatsapp-admin.controller';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';
import {
  CanalWhatsappRepository,
  EventoWebhookWhatsappRepository,
  MensagemWhatsappRepository,
  OptOutWhatsappRepository,
  TemplateWhatsappRepository,
} from './infra/whatsapp';
import {
  CanalWhatsappService,
  EnvioWhatsappService,
  GRAPH_API_CLIENT,
  JanelaWhatsappService,
  MetaGraphApiClient,
  OptOutWhatsappService,
  TemplateWhatsappService,
  WebhookWhatsappService,
} from './application/whatsapp';
import { AtendimentoController } from './atendimento.controller';
import { CrmAdminAtendimentoController } from './crm-admin-atendimento.controller';
import { AtendimentoRepository, RespostaRepository, TransferenciaRepository } from './infra/atendimento';
import {
  AbrirAtendimentoService,
  AtendimentoConsultaService,
  AtendimentoService,
  CrmAtendimentoEquipeService,
  CsatService,
  RespostaService,
  TransferenciaService,
} from './application/atendimento';

/**
 * `crm` — bounded context de domínio (specs 007 + 008 + 009 + 010 + 011 +
 * 012). Dono de `equipe`, `janela_atendimento`, `feriado`, `integracao`
 * (007); `lead` (008 — a 1ª entidade compartilhada do projeto; acesso por
 * RBAC 004); `interacao`, `tag`/`tag_associacao`, `segmento` (009 — timeline
 * unificada, catálogo de tag compartilhado lead\|pessoa\|interacao, query
 * salva); `pipeline`/`etapa_pipeline`/`oportunidade`/
 * `oportunidade_movimentacao`/`regra_atribuicao_pipeline`/
 * `campo_personalizado_oportunidade` (010 — pipeline de vendas, atribuição
 * automática, SLA/esfriando derivados); `canal_whatsapp`/`template_whatsapp`/
 * `mensagem_whatsapp`/`evento_webhook_whatsapp`/`opt_out_whatsapp` (011 —
 * integração com a Cloud API oficial da Meta, janela de 24h, webhook de
 * entrada autenticado por HMAC — não pelo `WebhookAuthenticator` da 003, que
 * é escopado a `PlataformaOrigem`); `atendimento`/`transferencia_atendimento`/
 * `resposta_atendimento` (012 — inbox de atendimento **sobre** a timeline de
 * `interacao` já existente — `interacao.atendimentoId` agrupa, nunca copia;
 * endereçamento por carga/disponibilidade e SLA de 1ª resposta são funções
 * PURAS, nunca contador/job de fundo; CSAT reaproveita `interacao` tipo
 * `NPS`, nenhuma tabela nova).
 *
 * Importa `core` (global) e `auth` (infra transversal — guard, `Permissao`,
 * `SujeitoRbacService`). **Nenhum import de `src/clientes/**`** — as FKs de
 * `interacao`/`tag_associacao`/`oportunidade`/`opt_out_whatsapp`/
 * `atendimento` para `Pessoa` vivem só no `schema.prisma` compartilhado
 * (mesmo precedente de `Lead.pessoaId`/`Lead.responsavelId`).
 *
 * **Exporta `RegistrarLeadService`** (035) e **`PortaObservacaoPagamentoService`**
 * (Financeiro/Workflow, quando existirem — D-02 da 010, sem gatilho real
 * ainda) — portas in-process. `RegistrarInteracaoService` (009) é reaproveitado
 * **internamente** pela 011 (webhook + envio) e pela 012 (respostas de
 * atendimento). `EnvioWhatsappService` (011) é reaproveitado **internamente**
 * pela 012 (resposta em atendimento de canal WhatsApp + resposta automática
 * fora do expediente) — sem consumidor externo novo, sem porta exportada
 * nova. `CONTEXT_MODULES` segue com 11.
 */
@Module({
  imports: [AuthModule],
  controllers: [
    CrmAdminController,
    LeadController,
    CampoPersonalizadoController,
    InteracaoController,
    PessoaTagController,
    TagController,
    SegmentoController,
    PipelineController,
    OportunidadeController,
    CampoOportunidadeController,
    WhatsappAdminController,
    WhatsappController,
    WhatsappWebhookController,
    AtendimentoController,
    CrmAdminAtendimentoController,
  ],
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
    // 009
    InteracaoRepository,
    TagRepository,
    TagAssociacaoRepository,
    SegmentoRepository,
    CrmInteracaoAuditService,
    InteracaoService,
    RegistrarInteracaoService,
    TagService,
    SegmentoService,
    // 010
    PipelineRepository,
    OportunidadeRepository,
    MovimentacaoRepository,
    RegraAtribuicaoRepository,
    CampoOportunidadeRepository,
    ValorCampoOportunidadeRepository,
    CrmPipelineAuditService,
    PipelineService,
    AtribuicaoService,
    OportunidadeService,
    OportunidadeConsultaService,
    MoverOportunidadeService,
    CampoOportunidadeService,
    ValorCampoOportunidadeService,
    MetricasService,
    PortaObservacaoPagamentoService,
    // 011
    CanalWhatsappRepository,
    TemplateWhatsappRepository,
    MensagemWhatsappRepository,
    EventoWebhookWhatsappRepository,
    OptOutWhatsappRepository,
    CanalWhatsappService,
    TemplateWhatsappService,
    WebhookWhatsappService,
    EnvioWhatsappService,
    JanelaWhatsappService,
    OptOutWhatsappService,
    { provide: GRAPH_API_CLIENT, useClass: MetaGraphApiClient },
    // 012
    AtendimentoRepository,
    TransferenciaRepository,
    RespostaRepository,
    AbrirAtendimentoService,
    AtendimentoService,
    RespostaService,
    TransferenciaService,
    CsatService,
    AtendimentoConsultaService,
    CrmAtendimentoEquipeService,
  ],
  exports: [
    RegistrarLeadService,
    RegistrarInteracaoService,
    PortaObservacaoPagamentoService,
  ],
})
export class CrmModule implements OnModuleInit {
  private readonly logger = new Logger('CrmModule');

  onModuleInit(): void {
    const admin = PERMISSOES.filter((p) => p.recurso === 'crm_admin').map((p) => p.id);
    const lead = PERMISSOES.filter((p) => p.recurso === 'lead').map((p) => p.id);
    const interacao = PERMISSOES.filter((p) => p.recurso === 'interacao').map((p) => p.id);
    const segmento = PERMISSOES.filter((p) => p.recurso === 'segmento').map((p) => p.id);
    const oportunidade = PERMISSOES.filter((p) => p.recurso === 'oportunidade').map(
      (p) => p.id,
    );
    const whatsapp = PERMISSOES.filter((p) => p.recurso === 'whatsapp').map((p) => p.id);
    const atendimento = PERMISSOES.filter((p) => p.recurso === 'atendimento').map((p) => p.id);
    this.logger.log(
      `crm.ready crm_admin=${admin.length} lead=${lead.length} interacao=${interacao.length} segmento=${segmento.length} oportunidade=${oportunidade.length} whatsapp=${whatsapp.length} atendimento=${atendimento.length}`,
    );
  }
}
