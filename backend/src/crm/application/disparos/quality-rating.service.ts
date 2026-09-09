import { BadGatewayException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { agoraUtc } from '../../../core/core.module';
import { CanalWhatsappRepository } from '../../infra/whatsapp';
import { CanalWhatsappService } from '../whatsapp/canal-whatsapp.service';
import { GRAPH_API_CLIENT, GraphApiError, type GraphApiClient } from '../whatsapp/graph-api-client';

/**
 * Quality rating do canal (spec 015, FR-009) — sempre uma consulta **sob
 * demanda** direto na Graph API, nunca persistida (Princípio VIII, research.md
 * D-R7).
 */
@Injectable()
export class QualityRatingService {
  constructor(
    private readonly canais: CanalWhatsappRepository,
    private readonly canalService: CanalWhatsappService,
    @Inject(GRAPH_API_CLIENT) private readonly graphApi: GraphApiClient,
  ) {}

  async consultar(canalId: string) {
    const canal = await this.canais.obter(canalId);
    if (!canal) throw new NotFoundException('canal de WhatsApp não encontrado');

    const accessToken = this.canalService.decifrarAccessToken(canal);
    try {
      const r = await this.graphApi.consultarQualityRating({
        phoneNumberId: canal.phoneNumberId,
        accessToken,
      });
      return { ...r, consultadoEm: agoraUtc().toISOString() };
    } catch (err) {
      const detalhe = err instanceof GraphApiError ? err.detalhe : undefined;
      throw new BadGatewayException({ erro: 'falha_provedor', detalhe });
    }
  }
}
