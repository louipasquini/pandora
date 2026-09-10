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
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { RequerPermissao } from './../auth/rbac/decorators/requer-permissao.decorator';
import {
  DashboardService,
  DashboardVisaoService,
  MetaComercialService,
  MetaNotificacaoService,
} from './application/dashboard';
import {
  atualizarMetaSchema,
  atualizarVisaoSchema,
  criarMetaSchema,
  criarVisaoSchema,
  filtrosDashboardSchema,
  listarMetasSchema,
} from './dto/dashboard/dashboard.schema';

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
 * Dashboard do CRM (spec 017). Leitura sob `dashboard:ver` (painéis específicos
 * filtrados pela permissão do recurso que expõem, dentro do serviço); metas
 * escrevem sob `dashboard:gerir_metas`; visões são preferência de leitura do
 * próprio usuário (`dashboard:ver`, só o dono edita).
 */
@Controller('crm/dashboard')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly metas: MetaComercialService,
    private readonly notificacoes: MetaNotificacaoService,
    private readonly visoes: DashboardVisaoService,
  ) {}

  // ------------------------------------------------------------- painéis
  @RequerPermissao('dashboard:ver')
  @Get()
  montar(@Query() q: Record<string, unknown>, @Req() req: Request) {
    return this.dashboard.montar(req, parse(filtrosDashboardSchema, q));
  }

  @RequerPermissao('dashboard:ver')
  @Get('paineis')
  catalogo(@Req() req: Request) {
    return this.dashboard.catalogo(req);
  }

  @RequerPermissao('dashboard:ver')
  @Get('notificacoes')
  listarNotificacoes(@Req() req: Request) {
    return this.notificacoes.notificacoes(req);
  }

  @RequerPermissao('dashboard:ver')
  @Get('paineis/:id')
  async painel(
    @Param('id') id: string,
    @Query() q: Record<string, unknown>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const dto = parse(filtrosDashboardSchema, q);
    const out = await this.dashboard.painel(req, id, dto);
    if ('csv' in out) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${id}.csv"`);
      return out.csv;
    }
    return out;
  }

  // --------------------------------------------------------------- metas
  @RequerPermissao('dashboard:ver')
  @Get('metas')
  listarMetas(@Query() q: Record<string, unknown>) {
    return this.metas.listar(parse(listarMetasSchema, q));
  }

  @RequerPermissao('dashboard:gerir_metas')
  @Post('metas')
  criarMeta(@Body() body: unknown, @Req() req: Request) {
    return this.metas.criar(parse(criarMetaSchema, body), req);
  }

  @RequerPermissao('dashboard:gerir_metas')
  @Patch('metas/:id')
  atualizarMeta(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    return this.metas.atualizar(id, parse(atualizarMetaSchema, body), req);
  }

  @RequerPermissao('dashboard:gerir_metas')
  @Delete('metas/:id')
  @HttpCode(204)
  async removerMeta(@Param('id') id: string, @Req() req: Request) {
    await this.metas.remover(id, req);
  }

  // -------------------------------------------------------------- visões
  @RequerPermissao('dashboard:ver')
  @Get('visoes')
  listarVisoes(@Req() req: Request) {
    return this.visoes.listar(req);
  }

  @RequerPermissao('dashboard:ver')
  @Post('visoes')
  criarVisao(@Body() body: unknown, @Req() req: Request) {
    return this.visoes.criar(parse(criarVisaoSchema, body), req);
  }

  @RequerPermissao('dashboard:ver')
  @Post('visoes/:id/clonar')
  clonarVisao(@Param('id') id: string, @Req() req: Request) {
    return this.visoes.clonar(id, req);
  }

  @RequerPermissao('dashboard:ver')
  @Patch('visoes/:id')
  atualizarVisao(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    return this.visoes.atualizar(id, parse(atualizarVisaoSchema, body), req);
  }

  @RequerPermissao('dashboard:ver')
  @Delete('visoes/:id')
  @HttpCode(204)
  async removerVisao(@Param('id') id: string, @Req() req: Request) {
    await this.visoes.remover(id, req);
  }
}
