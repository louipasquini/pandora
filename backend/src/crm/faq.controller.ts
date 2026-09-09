import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z, type ZodTypeAny } from 'zod';
import type { AuthContext } from '../auth/guards/jwt-auth.guard';
import { AutenticadoBasta } from '../auth/rbac/decorators/autenticado-basta.decorator';
import { RequerPermissao } from '../auth/rbac/decorators/requer-permissao.decorator';
import { FaqService } from './application/faq/faq.service';
import { atualizarFaqItemSchema, criarFaqItemSchema, listarFaqSchema } from './dto/faq/faq.schema';

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
 * FAQ (spec 013, FR-001/FR-002). Catálogo `@AutenticadoBasta()` (sem PII,
 * usado por qualquer atendente durante uma conversa — mesmo padrão do
 * catálogo de `tag`, spec 009). Administração (`/crm/admin/faq/**`) sob
 * `crm_admin:ver` (leitura) / `crm_admin:gerir_faq` (escrita).
 */
@Controller('crm')
export class FaqController {
  constructor(private readonly faq: FaqService) {}

  @AutenticadoBasta()
  @Get('faq')
  catalogo() {
    return this.faq.catalogo();
  }

  @RequerPermissao('crm_admin:ver')
  @Get('admin/faq')
  listar(@Query() q: Record<string, unknown>) {
    const { ativo } = parse(listarFaqSchema, q);
    return this.faq.listar(ativo);
  }

  @RequerPermissao('crm_admin:ver')
  @Get('admin/faq/:id')
  obter(@Param('id') id: string) {
    return this.faq.obter(id);
  }

  @RequerPermissao('crm_admin:ver')
  @Get('admin/faq/:id/versoes')
  versoes(@Param('id') id: string) {
    return this.faq.listarVersoes(id);
  }

  @RequerPermissao('crm_admin:gerir_faq')
  @Post('admin/faq')
  criar(@Body() body: unknown, @Req() req: Request) {
    return this.faq.criar(parse(criarFaqItemSchema, body), autor(req));
  }

  @RequerPermissao('crm_admin:gerir_faq')
  @Patch('admin/faq/:id')
  atualizar(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    return this.faq.atualizar(id, parse(atualizarFaqItemSchema, body), autor(req));
  }
}
