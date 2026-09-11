import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z, type ZodTypeAny } from 'zod';
import type { AuthContext } from '../auth/guards/jwt-auth.guard';
import { RequerPermissao } from '../auth/rbac/decorators/requer-permissao.decorator';
import { OfertaService } from './application';
import { criarOfertaSchema, listarOfertasSchema } from './dto/criar-oferta.schema';
import { curarOfertaSchema } from './dto/curar-oferta.schema';

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
 * Ofertas do catálogo (spec 023) — leitura sob `oferta:ver`; criação manual
 * sob `oferta:criar`; curadoria (inclui `oferta_catalogo`) sob `oferta:editar`.
 * A maioria nasce auto-criada pela etapa 5 do pipeline ou pelo import de CSV
 * Hotmart — `POST /ofertas` cobre o caso raro de oferta sem nenhuma venda.
 */
@Controller('ofertas')
export class OfertaController {
  constructor(private readonly ofertas: OfertaService) {}

  @RequerPermissao('oferta:ver')
  @Get()
  listar(@Query() q: Record<string, unknown>) {
    return this.ofertas.listar(parse(listarOfertasSchema, q));
  }

  @RequerPermissao('oferta:ver')
  @Get(':id')
  buscar(@Param('id') id: string) {
    return this.ofertas.buscarPorId(id);
  }

  @RequerPermissao('oferta:criar')
  @Post()
  criar(@Body() body: unknown) {
    return this.ofertas.criar(parse(criarOfertaSchema, body));
  }

  @RequerPermissao('oferta:editar')
  @Patch(':id')
  curar(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    return this.ofertas.curar(id, parse(curarOfertaSchema, body), autor(req));
  }
}
