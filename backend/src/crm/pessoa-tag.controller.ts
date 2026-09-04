import { BadRequestException, Body, Controller, Delete, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z, type ZodTypeAny } from 'zod';
import type { AuthContext } from '../auth/guards/jwt-auth.guard';
import { RequerPermissao } from '../auth/rbac/decorators/requer-permissao.decorator';
import { TagService } from './application/tag/tag.service';
import { associarTagSchema } from './dto/tag.schema';

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
 * Tags de `pessoa` (spec 009, CL-04) — mesmo catálogo compartilhado de lead
 * e interação. Sob `pessoa:editar` (005, sem permissão nova). Audita em
 * `crm_interacao_audit`.
 */
@Controller('crm/pessoas')
export class PessoaTagController {
  constructor(private readonly tags: TagService) {}

  @RequerPermissao('pessoa:editar')
  @Post(':id/tags')
  async addTag(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const dto = parse(associarTagSchema, body);
    const r = await this.tags.associar({ tipo: 'pessoa', id }, dto.tag, autor(req), autor(req));
    return { tags: r.tags };
  }

  @RequerPermissao('pessoa:editar')
  @HttpCode(200)
  @Delete(':id/tags')
  async removerTag(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const dto = parse(associarTagSchema, body);
    const r = await this.tags.desassociar({ tipo: 'pessoa', id }, dto.tag, autor(req));
    return { tags: r.tags };
  }
}
