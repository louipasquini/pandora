import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlataformaOrigem } from '@prisma/client';
import { PlataformaOrigem as PlataformaCore } from '../../core/plataforma-origem.enum';
import type { AppConfig } from '../../core/config';
import { WebhookAuthenticator } from '../../auth/webhook/webhook-authenticator';
import {
  parseWebhookHotmart,
  type ContaHotmart,
  type ResultadoParseHotmart,
} from '../adapters/hotmart';
import { RegistrarEventoService } from '../application/registrar-evento.service';

interface RespostaWebhook {
  registrados: number;
  ignorados: number;
  eventoIds: string[];
}

/**
 * Webhooks de compras `PURCHASE_*` da Hotmart, **por conta** (spec 022) — **STUB
 * para feature futura**. A Hotmart **não tem webhook na v1** (visão Parte 7): a
 * rota existe e o parser é completo/testado, mas o handler responde **503** até
 * `HOTMART_WEBHOOK_ENABLED=true`.
 *
 * Ligado: autentica o `hottok` (`HOTMART_<conta>_WEBHOOK_TOKEN` via
 * `WebhookAuthenticator`, header `X-HOTMART-HOTTOK` | `Authorization: Bearer`) →
 * parseia (removendo `hottok` do `payload_bruto` — defesa) → registra o evento
 * cru (etapa 0) → responde `200`. O worker faz o resto. Erro de parse **não** é
 * 5xx/4xx; só falha de persistência propaga como 5xx.
 */
@Controller('webhooks/hotmart')
export class HotmartWebhooksController {
  private readonly logger = new Logger(HotmartWebhooksController.name);

  constructor(
    private readonly auth: WebhookAuthenticator,
    private readonly registrar: RegistrarEventoService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Post('prd')
  @HttpCode(200)
  async prd(
    @Body() body: unknown,
    @Headers('x-hotmart-hottok') hottok?: string,
    @Headers('authorization') authHeader?: string,
  ): Promise<RespostaWebhook> {
    return this.receber('HOTMART_PRD', body, hottok, authHeader);
  }

  @Post('svc')
  @HttpCode(200)
  async svc(
    @Body() body: unknown,
    @Headers('x-hotmart-hottok') hottok?: string,
    @Headers('authorization') authHeader?: string,
  ): Promise<RespostaWebhook> {
    return this.receber('HOTMART_SVC', body, hottok, authHeader);
  }

  private habilitado(): boolean {
    return this.config.get('HOTMART_WEBHOOK_ENABLED', { infer: true }) === true;
  }

  private async receber(
    conta: ContaHotmart,
    body: unknown,
    hottok?: string,
    authHeader?: string,
  ): Promise<RespostaWebhook> {
    if (!this.habilitado()) {
      throw new ServiceUnavailableException({
        message: 'webhook Hotmart não habilitado nesta versão',
      });
    }
    this.autenticar(conta, hottok, authHeader);
    return this.registrarLote(conta, parseWebhookHotmart(body, conta));
  }

  private autenticar(
    conta: ContaHotmart,
    hottok?: string,
    authHeader?: string,
  ): void {
    const token =
      hottok ??
      (authHeader?.toLowerCase().startsWith('bearer ')
        ? authHeader.slice(7).trim()
        : authHeader);
    const r = this.auth.autenticar(PlataformaCore[conta], token || undefined);
    if (!r.autenticado) {
      throw new UnauthorizedException('não autorizado');
    }
  }

  private async registrarLote(
    conta: ContaHotmart,
    resultados: ResultadoParseHotmart[],
  ): Promise<RespostaWebhook> {
    const plataforma = PlataformaOrigem[conta];
    const eventoIds: string[] = [];
    let ignorados = 0;

    for (const r of resultados) {
      if (!r.idOrigem) {
        ignorados += 1;
        this.logger.warn(
          `hotmart.webhook ignorado (sem transaction) conta=${conta}: ${r.erros.join('; ')}`,
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
