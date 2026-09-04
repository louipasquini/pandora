import { BadRequestException, Body, Controller, Get, HttpCode, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z, type ZodTypeAny } from 'zod';
import type { AuthContext } from '../auth/guards/jwt-auth.guard';
import { RequerPermissao } from '../auth/rbac/decorators/requer-permissao.decorator';
import { EnvioWhatsappService, JanelaWhatsappService, OptOutWhatsappService } from './application/whatsapp';
import {
  enviarMensagemWhatsappSchema,
  janelaWhatsappQuerySchema,
} from './dto/whatsapp/enviar-mensagem-whatsapp.schema';
import {
  consultarOptOutQuerySchema,
  registrarOptOutSchema,
  reverterOptOutSchema,
} from './dto/whatsapp/optout-whatsapp.schema';

function autor(req: Request): string {
  return (req as Request & { auth?: AuthContext }).auth?.sub ?? 'desconhecido';
}

function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new BadRequestException({
      message: 'entrada inválida',
      detalhes: r.error.issues.map((i) => `${i.path.join('.') || '_'}: ${i.message}`),
    });
  }
  return r.data;
}

/**
 * Operação do dia a dia do canal de WhatsApp (spec 011): janela de 24h, envio
 * de mensagem individual e opt-out. Fila/inbox de atendimento (012) e disparo
 * em massa (015) ficam para specs futuras.
 */
@Controller('crm/whatsapp')
export class WhatsappController {
  constructor(
    private readonly janela: JanelaWhatsappService,
    private readonly envio: EnvioWhatsappService,
    private readonly optOut: OptOutWhatsappService,
  ) {}

  @RequerPermissao('whatsapp:ver')
  @Get('janela')
  obterJanela(@Query() q: Record<string, unknown>) {
    return this.janela.obter(parse(janelaWhatsappQuerySchema, q));
  }

  @RequerPermissao('whatsapp:enviar')
  @Post('mensagens')
  @HttpCode(201)
  enviarMensagem(@Body() body: unknown, @Req() req: Request) {
    return this.envio.enviar(parse(enviarMensagemWhatsappSchema, body), req);
  }

  @RequerPermissao('whatsapp:gerir_optout')
  @Post('optout')
  @HttpCode(200)
  registrarOptOut(@Body() body: unknown, @Req() req: Request) {
    return this.optOut.registrar(parse(registrarOptOutSchema, body), autor(req));
  }

  @RequerPermissao('whatsapp:gerir_optout')
  @Post('optout/reverter')
  @HttpCode(200)
  reverterOptOut(@Body() body: unknown, @Req() req: Request) {
    return this.optOut.reverter(parse(reverterOptOutSchema, body).telefone, autor(req));
  }

  @RequerPermissao('whatsapp:ver')
  @Get('optout')
  consultarOptOut(@Query() q: Record<string, unknown>) {
    return this.optOut.consultar(parse(consultarOptOutQuerySchema, q).telefone);
  }
}
