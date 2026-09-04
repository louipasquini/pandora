import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z, type ZodTypeAny } from 'zod';
import type { AuthContext } from '../auth/guards/jwt-auth.guard';
import { AutenticadoBasta } from '../auth/rbac/decorators/autenticado-basta.decorator';
import { RequerPermissao } from '../auth/rbac/decorators/requer-permissao.decorator';
import { TagService } from './application/tag/tag.service';
import { atualizarTagSchema, criarTagSchema } from './dto/tag.schema';

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
 * Catálogo de `tag` (spec 009). Leitura `@AutenticadoBasta()` (sem PII, útil
 * a qualquer picker de UI). Escrita administrativa sob `crm_admin:gerir_tags`
 * (recurso `crm_admin` da 007) — audita em `crm_admin_audit`.
 */
@Controller('crm')
export class TagController {
  constructor(private readonly tags: TagService) {}

  @AutenticadoBasta()
  @Get('tags')
  listar() {
    return this.tags.listarCatalogo();
  }

  @RequerPermissao('crm_admin:gerir_tags')
  @Post('admin/tags')
  criar(@Body() body: unknown, @Req() req: Request) {
    return this.tags.criarExplicita(parse(criarTagSchema, body), autor(req));
  }

  @RequerPermissao('crm_admin:gerir_tags')
  @Patch('admin/tags/:id')
  atualizar(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    return this.tags.atualizar(id, parse(atualizarTagSchema, body), autor(req));
  }
}
