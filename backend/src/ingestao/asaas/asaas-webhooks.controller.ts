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
  parseWebhookAsaas,
  type ContaAsaas,
  type ResultadoParseAsaas,
} from '../adapters/asaas';
import { RegistrarEventoService } from '../application/registrar-evento.service';

interface RespostaWebhook {
  registrados: number;
  ignorados: number;
  eventoIds: string[];
}

/**
 * Webhooks **públicos** da Asaas, **por conta** (spec 020). O prefixo `/webhooks/`
 * já é allowlist pública desde a 003; a autenticação real é o
 * `ASAAS_<conta>_WEBHOOK_TOKEN` verificado em tempo constante pelo
 * `WebhookAuthenticator` — a Asaas envia a "Access Token" no header
 * `asaas-access-token` (fallback `authorization: Bearer`).
 *
 * Controller **fino**: autentica → parseia → registra o evento cru (etapa 0,
 * spec 006) → responde `200`. O worker faz o resto. Erro de parse **não** é 5xx
 * (o evento cru é persistido e vai para revisão — A-08); só falha de persistência
 * propaga como 5xx (a Asaas reenfileira).
 */
@Controller('webhooks/asaas')
export class AsaasWebhooksController {
  private readonly logger = new Logger(AsaasWebhooksController.name);

  constructor(
    private readonly auth: WebhookAuthenticator,
    private readonly registrar: RegistrarEventoService,
  ) {}

  @Post('prd')
  @HttpCode(200)
  async prd(
    @Body() body: unknown,
    @Headers('asaas-access-token') tokenHeader?: string,
    @Headers('authorization') authHeader?: string,
  ): Promise<RespostaWebhook> {
    return this.receber('ASAAS_PRD', body, tokenHeader, authHeader);
  }

  @Post('svc')
  @HttpCode(200)
  async svc(
    @Body() body: unknown,
    @Headers('asaas-access-token') tokenHeader?: string,
    @Headers('authorization') authHeader?: string,
  ): Promise<RespostaWebhook> {
    return this.receber('ASAAS_SVC', body, tokenHeader, authHeader);
  }

  private async receber(
    conta: ContaAsaas,
    body: unknown,
    tokenHeader?: string,
    authHeader?: string,
  ): Promise<RespostaWebhook> {
    this.autenticar(conta, tokenHeader, authHeader);
    return this.registrarLote(conta, parseWebhookAsaas(body, conta));
  }

  private autenticar(conta: ContaAsaas, tokenHeader?: string, authHeader?: string): void {
    const token =
      tokenHeader ??
      (authHeader?.toLowerCase().startsWith('bearer ')
        ? authHeader.slice(7).trim()
        : authHeader);
    const r = this.auth.autenticar(PlataformaCore[conta], token || undefined);
    if (!r.autenticado) {
      throw new UnauthorizedException('não autorizado');
    }
  }

  private async registrarLote(
    conta: ContaAsaas,
    resultados: ResultadoParseAsaas[],
  ): Promise<RespostaWebhook> {
    const plataforma = PlataformaOrigem[conta];
    const eventoIds: string[] = [];
    let ignorados = 0;

    for (const r of resultados) {
      if (!r.idOrigem) {
        // Sem identidade não há como deduplicar nem projetar — evento não-cobrança
        // (TRANSFER_*, SUBSCRIPTION_*) ou lixo. Loga e não registra (A-09).
        ignorados += 1;
        this.logger.warn(
          `asaas.webhook ignorado (sem payment.id) conta=${conta}: ${r.erros.join('; ')}`,
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
