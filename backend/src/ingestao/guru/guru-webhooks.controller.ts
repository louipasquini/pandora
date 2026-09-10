import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { PlataformaOrigem } from '@prisma/client';
import { PlataformaOrigem as PlataformaCore } from '../../core/plataforma-origem.enum';
import { WebhookAuthenticator } from '../../auth/webhook/webhook-authenticator';
import {
  parseWebhookGuru,
  type ContaGuru,
  type ResultadoParseGuru,
} from '../adapters/guru';
import { RegistrarEventoService } from '../application/registrar-evento.service';

interface RespostaWebhook {
  registrados: number;
  ignorados: number;
  eventoIds: string[];
}

/**
 * Webhooks **públicos** da Guru, **por conta** (spec 021). O prefixo `/webhooks/`
 * já é allowlist pública desde a 003; a autenticação real é o
 * `GURU_<conta>_WEBHOOK_TOKEN` verificado em tempo constante pelo
 * `WebhookAuthenticator` — a Guru envia o token de validação **no campo
 * `api_token` do corpo** (equivale ao Account Token da conta), não em header.
 *
 * Controller **fino**: autentica → parseia (removendo `api_token` do
 * `payload_bruto` — segredo) → registra o evento cru (etapa 0, spec 006) →
 * responde `200`. O worker faz o resto. Erro de parse **não** é 5xx nem 4xx (a
 * Guru suprime retentativas em 4xx); só falha de persistência propaga como 5xx.
 */
@Controller('webhooks/guru')
export class GuruWebhooksController {
  private readonly logger = new Logger(GuruWebhooksController.name);

  constructor(
    private readonly auth: WebhookAuthenticator,
    private readonly registrar: RegistrarEventoService,
  ) {}

  @Post('prd')
  @HttpCode(200)
  async prd(@Body() body: unknown): Promise<RespostaWebhook> {
    return this.receber('GURU_PRD', body);
  }

  @Post('svc')
  @HttpCode(200)
  async svc(@Body() body: unknown): Promise<RespostaWebhook> {
    return this.receber('GURU_SVC', body);
  }

  private async receber(conta: ContaGuru, body: unknown): Promise<RespostaWebhook> {
    this.autenticar(conta, body);
    return this.registrarLote(conta, parseWebhookGuru(body, conta));
  }

  private autenticar(conta: ContaGuru, body: unknown): void {
    const token =
      body && typeof body === 'object' && 'api_token' in body
        ? String((body as Record<string, unknown>).api_token ?? '')
        : '';
    const r = this.auth.autenticar(PlataformaCore[conta], token || undefined);
    if (!r.autenticado) {
      throw new UnauthorizedException('não autorizado');
    }
  }

  private async registrarLote(
    conta: ContaGuru,
    resultados: ResultadoParseGuru[],
  ): Promise<RespostaWebhook> {
    const plataforma = PlataformaOrigem[conta];
    const eventoIds: string[] = [];
    let ignorados = 0;

    for (const r of resultados) {
      if (!r.idOrigem) {
        // Sem identidade não há como deduplicar nem projetar — webhook de
        // assinatura/contrato/eticket que a Guru manda para a mesma URL, ou lixo.
        // Loga e não registra (G-09).
        ignorados += 1;
        this.logger.warn(
          `guru.webhook ignorado (sem id de transação) conta=${conta}: ${r.erros.join('; ')}`,
        );
        continue;
      }
      const { eventoId } = await this.registrar.registrarEvento({
        plataformaOrigem: plataforma,
        tipoOrigem: r.tipoOrigem,
        idOrigem: r.idOrigem,
        payloadBruto: r.payloadBruto,
        eventoCanonico: r.eventoCanonico,
      });
      eventoIds.push(eventoId);
      if (!r.eventoCanonico) ignorados += 1;
    }

    return { registrados: eventoIds.length, ignorados, eventoIds };
  }
}
