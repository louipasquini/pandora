import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { SegmentoService } from './application/segmento/segmento.service';
import { atualizarSegmentoSchema } from './dto/atualizar-segmento.schema';
import {
  criarSegmentoSchema,
  listarSegmentosSchema,
  membrosSegmentoSchema,
} from './dto/criar-segmento.schema';

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
 * `segmento` (spec 009, CL-03). Leitura sob `segmento:ver`; escrita sob
 * `segmento:gerir`. `.../membros` combina o filtro salvo com o escopo de
 * visão do sujeito — nunca amplia o que ele já pode ver.
 */
@Controller('crm/segmentos')
export class SegmentoController {
  constructor(private readonly segmentos: SegmentoService) {}

  @RequerPermissao('segmento:ver')
  @Get()
  listar(@Query() q: Record<string, unknown>) {
    return this.segmentos.listar(parse(listarSegmentosSchema, q));
  }

  @RequerPermissao('segmento:ver')
  @Get(':id')
  detalhe(@Param('id') id: string) {
    return this.segmentos.obter(id);
  }

  @RequerPermissao('segmento:ver')
  @Get(':id/membros')
  membros(@Param('id') id: string, @Query() q: Record<string, unknown>, @Req() req: Request) {
    return this.segmentos.listarMembros(id, req, parse(membrosSegmentoSchema, q));
  }

  @RequerPermissao('segmento:gerir')
  @Post()
  criar(@Body() body: unknown, @Req() req: Request) {
    return this.segmentos.criar(parse(criarSegmentoSchema, body), autor(req));
  }

  @RequerPermissao('segmento:gerir')
  @Patch(':id')
  atualizar(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    return this.segmentos.atualizar(id, parse(atualizarSegmentoSchema, body), autor(req));
  }

  @RequerPermissao('segmento:gerir')
  @HttpCode(204)
  @Delete(':id')
  async remover(@Param('id') id: string, @Req() req: Request) {
    await this.segmentos.remover(id, autor(req));
  }
}
