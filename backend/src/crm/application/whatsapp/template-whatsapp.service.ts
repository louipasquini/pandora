import { BadGatewayException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { TemplateWhatsappStatus } from '@prisma/client';
import { agoraUtc } from '../../../core/core.module';
import { CanalWhatsappRepository, TemplateWhatsappRepository } from '../../infra/whatsapp';
import { CrmAdminAuditService } from '../crm-admin-audit.service';
import { CanalWhatsappService } from './canal-whatsapp.service';
import { GRAPH_API_CLIENT, GraphApiError, type GraphApiClient } from './graph-api-client';

const MAPA_STATUS_META: Record<string, TemplateWhatsappStatus> = {
  APPROVED: 'APROVADO',
  PENDING: 'PENDENTE',
  REJECTED: 'REJEITADO',
  PAUSED: 'PAUSADO',
  DISABLED: 'DESABILITADO',
};

function statusLocal(bruto: string): TemplateWhatsappStatus {
  return MAPA_STATUS_META[bruto?.toUpperCase()] ?? 'PENDENTE';
}

@Injectable()
export class TemplateWhatsappService {
  constructor(
    private readonly repo: TemplateWhatsappRepository,
    private readonly canais: CanalWhatsappRepository,
    private readonly canalService: CanalWhatsappService,
    private readonly audit: CrmAdminAuditService,
    @Inject(GRAPH_API_CLIENT) private readonly graphApi: GraphApiClient,
  ) {}

  async sincronizar(canalId: string, autor: string) {
    const canal = await this.canais.obter(canalId);
    if (!canal) throw new NotFoundException('canal de WhatsApp não encontrado');
    if (!canal.ativo) throw new ConflictException({ erro: 'canal_inativo' });

    const accessToken = this.canalService.decifrarAccessToken(canal);
    let templatesMeta;
    try {
      templatesMeta = await this.graphApi.buscarTemplates({
        wabaId: canal.wabaId,
        accessToken,
      });
    } catch (err) {
      const detalhe = err instanceof GraphApiError ? err.detalhe : undefined;
      throw new BadGatewayException({ erro: 'falha_provedor', detalhe });
    }

    const sincronizadoEm = agoraUtc();
    const templates = [];
    for (const t of templatesMeta) {
      templates.push(
        await this.repo.upsert({
          canalId,
          nomeMeta: t.nomeMeta,
          idioma: t.idioma,
          categoria: t.categoria,
          corpo: t.corpo,
          statusAprovacao: statusLocal(t.statusAprovacao),
          motivoRejeicao: t.motivoRejeicao,
          sincronizadoEm,
        }),
      );
    }

    await this.audit.registrar({
      autor,
      entidade: 'template_whatsapp',
      entidadeId: canalId,
      campo: 'sincronizado',
      valorAnterior: null,
      valorNovo: { total: templates.length },
      motivo: 'templates sincronizados via POST /crm/admin/whatsapp/canais/{id}/templates/sincronizar',
    });

    return { sincronizados: templates.length, templates };
  }

  listar(canalId: string, statusAprovacao?: TemplateWhatsappStatus) {
    return this.repo.listarPorCanal(canalId, statusAprovacao);
  }
}
