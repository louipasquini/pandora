import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { z, type ZodTypeAny } from 'zod';
import type { AuthContext } from '../auth/guards/jwt-auth.guard';
import { RequerPermissao } from '../auth/rbac/decorators/requer-permissao.decorator';
import { CanalWhatsappService, TemplateWhatsappService } from './application/whatsapp';
import { EventoWebhookWhatsappRepository } from './infra/whatsapp';
import {
  atualizarCanalWhatsappSchema,
  criarCanalWhatsappSchema,
  listarCanaisWhatsappSchema,
  listarTemplatesWhatsappSchema,
} from './dto/whatsapp/canal-whatsapp.schema';
import { listarEventosWebhookSchema } from './dto/whatsapp/listar-eventos-webhook.schema';

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
 * Administração do canal de WhatsApp e catálogo de templates (spec 011).
 * Leitura sob `crm_admin:ver` (canal) / `whatsapp:ver` (templates); escrita
 * sob `crm_admin:gerir_whatsapp`.
 */
@Controller('crm/admin/whatsapp')
export class WhatsappAdminController {
  constructor(
    private readonly canais: CanalWhatsappService,
    private readonly templates: TemplateWhatsappService,
    private readonly eventos: EventoWebhookWhatsappRepository,
  ) {}

  @RequerPermissao('crm_admin:ver')
  @Get('canais')
  listarCanais(@Query() q: Record<string, unknown>) {
    return this.canais.listar(parse(listarCanaisWhatsappSchema, q));
  }

  @RequerPermissao('crm_admin:ver')
  @Get('canais/:id')
  verCanal(@Param('id') id: string) {
    return this.canais.obter(id);
  }

  @RequerPermissao('crm_admin:gerir_whatsapp')
  @Post('canais')
  @HttpCode(201)
  criarCanal(@Body() body: unknown, @Req() req: Request) {
    return this.canais.criar(parse(criarCanalWhatsappSchema, body), autor(req));
  }

  @RequerPermissao('crm_admin:gerir_whatsapp')
  @Patch('canais/:id')
  atualizarCanal(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    return this.canais.atualizar(id, parse(atualizarCanalWhatsappSchema, body), autor(req));
  }

  @RequerPermissao('crm_admin:gerir_whatsapp')
  @Post('canais/:id/templates/sincronizar')
  @HttpCode(200)
  sincronizarTemplates(@Param('id') id: string, @Req() req: Request) {
    return this.templates.sincronizar(id, autor(req));
  }

  @RequerPermissao('whatsapp:ver')
  @Get('canais/:id/templates')
  listarTemplates(@Param('id') id: string, @Query() q: Record<string, unknown>) {
    const { statusAprovacao } = parse(listarTemplatesWhatsappSchema, q);
    return this.templates.listar(id, statusAprovacao);
  }

  @RequerPermissao('crm_admin:ver')
  @Get('eventos')
  listarEventos(@Query() q: Record<string, unknown>) {
    return this.eventos.listar(parse(listarEventosWebhookSchema, q));
  }

  @RequerPermissao('crm_admin:ver')
  @Get('eventos/:id')
  verEvento(@Param('id') id: string) {
    return this.eventos.obter(id);
  }
}
