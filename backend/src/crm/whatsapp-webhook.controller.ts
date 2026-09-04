import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { WebhookWhatsappService } from './application/whatsapp';

/**
 * Webhook de entrada da Meta Cloud API (spec 011) — coberto pelo prefixo
 * público `/webhooks/` (allowlist por path da spec 003); **não** passa por
 * `@Public()` nem por permissão — a segurança é a assinatura HMAC (`POST`) e
 * o `verify_token` (`GET`), ver `crm/domain/whatsapp/assinatura.ts`.
 */
@Controller('webhooks/whatsapp')
export class WhatsappWebhookController {
  constructor(private readonly webhook: WebhookWhatsappService) {}

  @Get()
  async handshake(@Query() q: Record<string, string>, @Res() res: Response): Promise<void> {
    if (q['hub.mode'] !== 'subscribe') {
      throw new ForbiddenException();
    }
    const ok = await this.webhook.validarHandshake(q['hub.verify_token'] ?? '');
    if (!ok) {
      throw new ForbiddenException();
    }
    res.status(200).type('text/plain').send(q['hub.challenge'] ?? '');
  }

  @Post()
  @HttpCode(200)
  async receber(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') assinatura: string | undefined,
  ): Promise<{ status: 'ok' }> {
    const corpoBruto = req.rawBody;
    if (!corpoBruto) {
      throw new UnauthorizedException();
    }
    const resultado = await this.webhook.processarEvento(corpoBruto, assinatura);
    if (!resultado.ok) {
      throw new UnauthorizedException();
    }
    return { status: 'ok' };
  }
}
