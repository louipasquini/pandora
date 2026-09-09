import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { z, type ZodTypeAny } from 'zod';
import type { AuthContext } from '../auth/guards/jwt-auth.guard';
import { AutenticadoBasta } from '../auth/rbac/decorators/autenticado-basta.decorator';
import { RequerPermissao } from '../auth/rbac/decorators/requer-permissao.decorator';
import { ChecklistService } from './application/tarefa/checklist.service';
import { CronometroService } from './application/tarefa/cronometro.service';
import { DelegacaoService } from './application/tarefa/delegacao.service';
import { DependenciaService } from './application/tarefa/dependencia.service';
import { NotaTarefaService } from './application/tarefa/nota-tarefa.service';
import { NotificacaoService } from './application/tarefa/notificacao.service';
import { RankingService } from './application/tarefa/ranking.service';
import { TarefaConsultaService } from './application/tarefa/tarefa-consulta.service';
import { TarefaService } from './application/tarefa/tarefa.service';
import {
  atualizarChecklistItemSchema,
  atualizarTarefaSchema,
  criarChecklistItemSchema,
  criarDependenciaSchema,
  criarNotaTarefaSchema,
  criarTarefaSchema,
  delegarTarefaSchema,
  listarTarefasSchema,
  mudarStatusTarefaSchema,
  rankingTarefasSchema,
} from './dto/tarefa.schema';

function autor(req: Request): string {
  return (req as Request & { auth?: AuthContext }).auth?.sub ?? 'desconhecido';
}

function autorOuNulo(req: Request): string | null {
  return (req as Request & { auth?: AuthContext }).auth?.sub ?? null;
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
 * `tarefa` (spec 016) — leitura sob escopo `ver_todas`\|`ver_proprias`
 * (`@AutenticadoBasta()` + gate no serviço, mesmo padrão da 008/010); escrita
 * sob `tarefa:{criar,editar,delegar}`.
 */
@Controller('crm')
export class TarefaController {
  constructor(
    private readonly tarefas: TarefaService,
    private readonly consulta: TarefaConsultaService,
    private readonly checklist: ChecklistService,
    private readonly cronometro: CronometroService,
    private readonly notas: NotaTarefaService,
    private readonly dependencias: DependenciaService,
    private readonly delegacoes: DelegacaoService,
    private readonly ranking: RankingService,
    private readonly notificacoes: NotificacaoService,
  ) {}

  @RequerPermissao('tarefa:criar')
  @Post('tarefas')
  criar(@Body() body: unknown, @Req() req: Request) {
    return this.tarefas.criar(parse(criarTarefaSchema, body), { criadoPorId: autorOuNulo(req) });
  }

  @AutenticadoBasta()
  @Get('tarefas')
  listar(@Query() q: Record<string, unknown>, @Req() req: Request) {
    return this.consulta.listar(parse(listarTarefasSchema, q), req);
  }

  @AutenticadoBasta()
  @Get('tarefas/ranking')
  rankingGet(@Query() q: Record<string, unknown>) {
    const dto = parse(rankingTarefasSchema, q);
    return this.ranking.ranking(dto.desde ? new Date(dto.desde) : null, dto.ate ? new Date(dto.ate) : null);
  }

  @AutenticadoBasta()
  @Get('tarefas/notificacoes')
  notificacoesGet(@Req() req: Request) {
    return this.notificacoes.minhasNotificacoes(req);
  }

  @AutenticadoBasta()
  @Get('tarefas/:id')
  detalhe(@Param('id') id: string, @Req() req: Request) {
    return this.consulta.obter(id, req);
  }

  @RequerPermissao('tarefa:editar')
  @Patch('tarefas/:id')
  async atualizar(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    await this.consulta.exigirNoEscopo(id, req);
    return this.tarefas.atualizar(id, parse(atualizarTarefaSchema, body), autor(req));
  }

  @RequerPermissao('tarefa:editar')
  @Post('tarefas/:id/status')
  async mudarStatus(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    await this.consulta.exigirNoEscopo(id, req);
    const dto = parse(mudarStatusTarefaSchema, body);
    return this.tarefas.mudarStatus(id, dto.status, autor(req));
  }

  @RequerPermissao('tarefa:delegar')
  @Post('tarefas/:id/delegar')
  async delegar(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    await this.consulta.exigirNoEscopo(id, req);
    const dto = parse(delegarTarefaSchema, body);
    return this.delegacoes.delegar(id, dto.responsavelId ?? null, autorOuNulo(req), dto.motivo ?? null);
  }

  @AutenticadoBasta()
  @Get('tarefas/:id/delegacoes')
  async listarDelegacoes(@Param('id') id: string, @Req() req: Request) {
    await this.consulta.exigirNoEscopo(id, req);
    return { itens: await this.delegacoes.listar(id) };
  }

  // --- Checklist ---

  @RequerPermissao('tarefa:editar')
  @Post('tarefas/:id/checklist')
  async criarChecklistItem(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    await this.consulta.exigirNoEscopo(id, req);
    const dto = parse(criarChecklistItemSchema, body);
    return this.checklist.criar(id, dto.texto);
  }

  @RequerPermissao('tarefa:editar')
  @Patch('tarefas/:id/checklist/:itemId')
  async atualizarChecklistItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    await this.consulta.exigirNoEscopo(id, req);
    const dto = parse(atualizarChecklistItemSchema, body);
    return this.checklist.atualizar(id, itemId, dto);
  }

  @RequerPermissao('tarefa:editar')
  @Delete('tarefas/:id/checklist/:itemId')
  async removerChecklistItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Req() req: Request,
  ) {
    await this.consulta.exigirNoEscopo(id, req);
    await this.checklist.remover(id, itemId);
    return { ok: true };
  }

  // --- Cronômetro ---

  @RequerPermissao('tarefa:editar')
  @Post('tarefas/:id/cronometro/iniciar')
  async iniciarCronometro(@Param('id') id: string, @Req() req: Request) {
    await this.consulta.exigirNoEscopo(id, req);
    return this.cronometro.iniciar(id);
  }

  @RequerPermissao('tarefa:editar')
  @Post('tarefas/:id/cronometro/parar')
  async pararCronometro(@Param('id') id: string, @Req() req: Request) {
    await this.consulta.exigirNoEscopo(id, req);
    return this.cronometro.parar(id);
  }

  @AutenticadoBasta()
  @Get('tarefas/:id/cronometro')
  async obterCronometro(@Param('id') id: string, @Req() req: Request) {
    await this.consulta.exigirNoEscopo(id, req);
    return this.cronometro.obter(id);
  }

  // --- Notas de acompanhamento ---

  @RequerPermissao('tarefa:editar')
  @Post('tarefas/:id/notas')
  async criarNota(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    await this.consulta.exigirNoEscopo(id, req);
    const dto = parse(criarNotaTarefaSchema, body);
    return this.notas.registrar(id, autorOuNulo(req), dto.conteudo);
  }

  @AutenticadoBasta()
  @Get('tarefas/:id/notas')
  async listarNotas(@Param('id') id: string, @Req() req: Request) {
    await this.consulta.exigirNoEscopo(id, req);
    return { itens: await this.notas.listar(id) };
  }

  // --- Dependências ---

  @RequerPermissao('tarefa:editar')
  @Post('tarefas/:id/dependencias')
  async adicionarDependencia(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    await this.consulta.exigirNoEscopo(id, req);
    const dto = parse(criarDependenciaSchema, body);
    return this.dependencias.adicionar(id, dto.dependeDeId);
  }

  @RequerPermissao('tarefa:editar')
  @Delete('tarefas/:id/dependencias/:dependeDeId')
  async removerDependencia(
    @Param('id') id: string,
    @Param('dependeDeId') dependeDeId: string,
    @Req() req: Request,
  ) {
    await this.consulta.exigirNoEscopo(id, req);
    await this.dependencias.remover(id, dependeDeId);
    return { ok: true };
  }

  @AutenticadoBasta()
  @Get('tarefas/:id/dependencias')
  async listarDependencias(@Param('id') id: string, @Req() req: Request) {
    await this.consulta.exigirNoEscopo(id, req);
    return { itens: await this.dependencias.listar(id) };
  }

  // --- Por pessoa (composição, read-only) ---

  @RequerPermissao('pessoa:ver')
  @Get('pessoas/:pessoaId/tarefas')
  listarPorPessoa(@Param('pessoaId') pessoaId: string, @Req() req: Request) {
    return this.consulta.listarPorPessoa(pessoaId, req);
  }
}
