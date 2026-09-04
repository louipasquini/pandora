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
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { z, type ZodTypeAny } from 'zod';
import type { AuthContext } from '../auth/guards/jwt-auth.guard';
import { AutenticadoBasta } from '../auth/rbac/decorators/autenticado-basta.decorator';
import { RequerPermissao } from '../auth/rbac/decorators/requer-permissao.decorator';
import { AtribuicaoService } from './application/pipeline/atribuicao.service';
import { MetricasService } from './application/pipeline/metricas.service';
import { PipelineService } from './application/pipeline/pipeline.service';
import {
  atribuicaoPipelineSchema,
  criarEtapaSchema,
  criarPipelineSchema,
  listarPipelinesSchema,
  patchEtapaSchema,
  patchPipelineSchema,
} from './dto/pipeline.schema';

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
 * Pipeline/etapa/atribuição/métricas (spec 010, US1/US4/US6). Leitura exige
 * alguma visão de oportunidade (`ver_todas`\|`ver_proprias` — OR, checado no
 * serviço via `@AutenticadoBasta()`); escrita administrativa sob
 * `crm_admin:gerir_pipelines`.
 */
@Controller('crm/pipelines')
export class PipelineController {
  constructor(
    private readonly pipelines: PipelineService,
    private readonly atribuicao: AtribuicaoService,
    private readonly metricas: MetricasService,
  ) {}

  @AutenticadoBasta()
  @Get()
  listar(@Query() q: Record<string, unknown>, @Req() req: Request) {
    return this.pipelines.listar(parse(listarPipelinesSchema, q), req);
  }

  @AutenticadoBasta()
  @Get(':id')
  detalhe(@Param('id') id: string, @Req() req: Request) {
    return this.pipelines.detalhe(id, req);
  }

  @RequerPermissao('crm_admin:gerir_pipelines')
  @Post()
  criar(@Body() body: unknown, @Req() req: Request) {
    return this.pipelines.criar(parse(criarPipelineSchema, body), autor(req));
  }

  @RequerPermissao('crm_admin:gerir_pipelines')
  @Patch(':id')
  patch(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    return this.pipelines.patch(id, parse(patchPipelineSchema, body), autor(req));
  }

  @AutenticadoBasta()
  @Get(':id/etapas')
  listarEtapas(@Param('id') id: string, @Req() req: Request) {
    return this.pipelines.listarEtapas(id, req);
  }

  @RequerPermissao('crm_admin:gerir_pipelines')
  @Post(':id/etapas')
  criarEtapa(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    return this.pipelines.criarEtapa(id, parse(criarEtapaSchema, body), autor(req));
  }

  @RequerPermissao('crm_admin:gerir_pipelines')
  @Patch(':id/etapas/:etapaId')
  patchEtapa(
    @Param('id') id: string,
    @Param('etapaId') etapaId: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    return this.pipelines.patchEtapa(id, etapaId, parse(patchEtapaSchema, body), autor(req));
  }

  @RequerPermissao('crm_admin:gerir_pipelines')
  @HttpCode(200)
  @Delete(':id/etapas/:etapaId')
  removerEtapa(
    @Param('id') id: string,
    @Param('etapaId') etapaId: string,
    @Req() req: Request,
  ) {
    return this.pipelines.removerEtapa(id, etapaId, autor(req));
  }

  @AutenticadoBasta()
  @Get(':id/atribuicao')
  async obterAtribuicao(@Param('id') id: string, @Req() req: Request) {
    await this.pipelines.exigirLeitura(req);
    return this.atribuicao.obter(id);
  }

  @RequerPermissao('crm_admin:gerir_pipelines')
  @Put(':id/atribuicao')
  substituirAtribuicao(@Param('id') id: string, @Body() body: unknown) {
    return this.atribuicao.substituir(id, parse(atribuicaoPipelineSchema, body));
  }

  @AutenticadoBasta()
  @Get(':id/metricas')
  obterMetricas(@Param('id') id: string, @Req() req: Request) {
    return this.metricas.metricas(id, req);
  }
}
