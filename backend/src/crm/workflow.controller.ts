import {
  BadRequestException,
  Body,
  Controller,
  Get,
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
import { RequerPermissao } from '../auth/rbac/decorators/requer-permissao.decorator';
import {
  ExecucaoConsultaService,
  FluxoService,
  ModeloService,
  SimulacaoService,
  WorkerService,
} from './application/workflow';
import {
  atualizarMetadadoFluxoSchema,
  criarFluxoSchema,
  listarExecucoesSchema,
  listarFluxosSchema,
  simularSchema,
  substituirRascunhoSchema,
  usarComoBaseSchema,
} from './dto/workflow/workflow.schema';

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
 * Motor de automação do CRM (spec 014, visão 8.8) — `/crm/workflow/**`.
 * Leitura sob `crm_admin:ver` (007); escrita sob `crm_admin:gerir_workflow`
 * (nova). Ver contracts/workflow.md da spec 014.
 */
@Controller('crm/workflow')
export class WorkflowController {
  constructor(
    private readonly fluxos: FluxoService,
    private readonly simulacao: SimulacaoService,
    private readonly modelos: ModeloService,
    private readonly execucoes: ExecucaoConsultaService,
    private readonly worker: WorkerService,
  ) {}

  @RequerPermissao('crm_admin:gerir_workflow')
  @Post('fluxos')
  criar(@Body() body: unknown, @Req() req: Request) {
    return this.fluxos.criar(parse(criarFluxoSchema, body), autor(req));
  }

  @RequerPermissao('crm_admin:ver')
  @Get('fluxos')
  async listar(@Query() q: Record<string, unknown>) {
    return { itens: await this.fluxos.listar(parse(listarFluxosSchema, q)) };
  }

  @RequerPermissao('crm_admin:ver')
  @Get('fluxos/:id')
  obter(@Param('id') id: string) {
    return this.fluxos.obter(id);
  }

  @RequerPermissao('crm_admin:gerir_workflow')
  @Patch('fluxos/:id')
  atualizarMetadado(@Param('id') id: string, @Body() body: unknown) {
    return this.fluxos.atualizarMetadado(id, parse(atualizarMetadadoFluxoSchema, body));
  }

  @RequerPermissao('crm_admin:gerir_workflow')
  @Put('fluxos/:id/rascunho')
  substituirRascunho(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    return this.fluxos.substituirRascunho(id, parse(substituirRascunhoSchema, body), autor(req));
  }

  @RequerPermissao('crm_admin:gerir_workflow')
  @Post('fluxos/:id/publicar')
  publicar(@Param('id') id: string, @Req() req: Request) {
    return this.fluxos.publicar(id, autor(req));
  }

  @RequerPermissao('crm_admin:gerir_workflow')
  @Post('fluxos/:id/arquivar')
  arquivar(@Param('id') id: string, @Req() req: Request) {
    return this.fluxos.arquivar(id, autor(req));
  }

  @RequerPermissao('crm_admin:ver')
  @Get('fluxos/:id/versoes')
  async listarVersoes(@Param('id') id: string) {
    return { itens: await this.fluxos.listarVersoes(id) };
  }

  @RequerPermissao('crm_admin:gerir_workflow')
  @Post('fluxos/:id/simular')
  simular(@Param('id') id: string, @Body() body: unknown) {
    return this.simulacao.simular(id, parse(simularSchema, body));
  }

  @RequerPermissao('crm_admin:ver')
  @Get('fluxos/:id/execucoes')
  async listarExecucoes(@Param('id') id: string, @Query() q: Record<string, unknown>) {
    const dto = parse(listarExecucoesSchema, q);
    return { itens: await this.execucoes.listarPorFluxo(id, dto) };
  }

  @RequerPermissao('crm_admin:ver')
  @Get('execucoes/:id')
  obterExecucao(@Param('id') id: string) {
    return this.execucoes.obterPorId(id);
  }

  @RequerPermissao('crm_admin:ver')
  @Get('modelos')
  async listarModelos() {
    return { itens: await this.modelos.listar() };
  }

  @RequerPermissao('crm_admin:gerir_workflow')
  @Post('modelos/:id/usar-como-base')
  usarComoBase(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    return this.modelos.usarComoBase(id, parse(usarComoBaseSchema, body), autor(req));
  }

  @RequerPermissao('crm_admin:gerir_workflow')
  @Post('processar')
  processar() {
    return this.worker.processarPassada();
  }
}
