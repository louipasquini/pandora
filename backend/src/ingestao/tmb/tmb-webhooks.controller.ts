import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { PlataformaOrigem } from '@prisma/client';
import { PlataformaOrigem as PlataformaCore } from '../../core/plataforma-origem.enum';
import { WebhookAuthenticator } from '../../auth/webhook/webhook-authenticator';
import {
  parseWebhookFinanceiro,
  parseWebhookVendas,
  type ResultadoParseTmb,
} from '../adapters/tmb';
import { RegistrarEventoService } from '../application/registrar-evento.service';

interface RespostaWebhook {
  registrados: number;
  ignorados: number;
  eventoIds: string[];
}

/**
 * Webhooks **públicos** da TMB (spec 019). O prefixo `/webhooks/` já é allowlist
 * pública desde a 003 (o `JwtAuthGuard` e o `PermissionGuard` liberam por path);
 * a autenticação real é o `TMB_WEBHOOK_TOKEN` verificado em tempo constante pelo
 * `WebhookAuthenticator` — separado do JWT de serviço.
 *
 * Controller **fino**: autentica → parseia → registra o evento cru (etapa 0,
 * spec 006) → responde `202`. O worker faz o resto. Erro de parse **não** é 5xx
 * (o evento cru é persistido e vai para revisão — visão 5.3 / D-07); só falha de
 * persistência propaga como 5xx (a TMB reenvia).
 */
@Controller('webhooks/tmb')
export class TmbWebhooksController {
  private readonly logger = new Logger(TmbWebhooksController.name);

  constructor(
    private readonly auth: WebhookAuthenticator,
    private readonly registrar: RegistrarEventoService,
  ) {}

  @Post('vendas')
  @HttpCode(202)
  async vendas(
    @Body() body: unknown,
    @Headers('x-tmb-webhook-token') tokenHeader?: string,
    @Headers('authorization') authHeader?: string,
  ): Promise<RespostaWebhook> {
    this.autenticar(tokenHeader, authHeader);
    return this.registrarLote([parseWebhookVendas(body)]);
  }

  @Post('financeiro')
  @HttpCode(202)
  async financeiro(
    @Body() body: unknown,
    @Headers('x-tmb-webhook-token') tokenHeader?: string,
    @Headers('authorization') authHeader?: string,
  ): Promise<RespostaWebhook> {
    this.autenticar(tokenHeader, authHeader);
    return this.registrarLote(parseWebhookFinanceiro(body));
  }

  private autenticar(tokenHeader?: string, authHeader?: string): void {
    const token =
      tokenHeader ??
      (authHeader?.toLowerCase().startsWith('bearer ')
        ? authHeader.slice(7).trim()
        : authHeader);
    const r = this.auth.autenticar(PlataformaCore.TMB, token || undefined);
    if (!r.autenticado) {
      throw new UnauthorizedException('não autorizado');
    }
  }

  private async registrarLote(
    resultados: ResultadoParseTmb[],
  ): Promise<RespostaWebhook> {
    const eventoIds: string[] = [];
    let ignorados = 0;

    for (const r of resultados) {
      if (!r.idOrigem) {
        // Sem identidade não há como deduplicar nem projetar — registra mesmo
        // assim para não perder o fato (payload_bruto imutável).
        ignorados += 1;
        this.logger.warn(`tmb.webhook ignorado (sem pedido): ${r.erros.join('; ')}`);
        continue;
      }
      const { eventoId } = await this.registrar.registrarEvento({
        plataformaOrigem: PlataformaOrigem.TMB,
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
