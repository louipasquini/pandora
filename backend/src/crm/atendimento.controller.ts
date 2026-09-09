import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z, type ZodTypeAny } from 'zod';
import type { AuthContext } from '../auth/guards/jwt-auth.guard';
import { AutenticadoBasta } from '../auth/rbac/decorators/autenticado-basta.decorator';
import { RequerPermissao } from '../auth/rbac/decorators/requer-permissao.decorator';
import {
  AtendimentoConsultaService,
  AtendimentoService,
  CsatService,
  RespostaService,
  TransferenciaService,
  projetarAtendimento,
} from './application/atendimento';
import { DecidirSugestaoService, GerarSugestaoService } from './application/sugestao-ia';
import { InteracaoRepository } from './infra/interacao/interacao.repository';
import { projetarInteracao } from './application/interacao/interacao.service';
import {
  criarAtendimentoManualSchema,
  encerrarAtendimentoSchema,
  listarAtendimentosSchema,
  registrarCsatSchema,
  responderAtendimentoSchema,
  transferirAtendimentoSchema,
} from './dto/atendimento/atendimento.schema';
import {
  aceitarSugestaoSchema,
  feedbackSugestaoSchema,
  gerarSugestaoSchema,
  listarSugestoesSchema,
} from './dto/sugestao-ia/sugestao-ia.schema';
import { agoraUtc } from '../core/core.module';

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
 * `atendimento` (spec 012, US1..US5). Leitura sob escopo `ver_todos`\|
 * `ver_proprios` (`@AutenticadoBasta()` + gate no serviço, mesmo padrão de
 * `lead`/`oportunidade`); escrita sob `atendimento:{atender,transferir,
 * encerrar}`.
 */
@Controller('crm')
export class AtendimentoController {
  constructor(
    private readonly atendimentos: AtendimentoService,
    private readonly consulta: AtendimentoConsultaService,
    private readonly respostas: RespostaService,
    private readonly transferencias: TransferenciaService,
    private readonly csat: CsatService,
    private readonly interacoes: InteracaoRepository,
    private readonly gerarSugestao: GerarSugestaoService,
    private readonly decidirSugestao: DecidirSugestaoService,
  ) {}

  @RequerPermissao('atendimento:atender')
  @Post('atendimentos')
  async criarManual(@Body() body: unknown) {
    const dto = parse(criarAtendimentoManualSchema, body);
    const resultado = await this.atendimentos.criarManual(dto);
    return resultado;
  }

  @AutenticadoBasta()
  @Get('atendimentos')
  listar(@Query() q: Record<string, unknown>, @Req() req: Request) {
    return this.consulta.listar(parse(listarAtendimentosSchema, q), req);
  }

  @AutenticadoBasta()
  @Get('atendimentos/:id')
  obter(@Param('id') id: string, @Req() req: Request) {
    return this.consulta.obter(id, req);
  }

  @AutenticadoBasta()
  @Get('atendimentos/:id/timeline')
  async timeline(@Param('id') id: string, @Req() req: Request) {
    await this.consulta.exigirNoEscopo(id, req);
    const itens = await this.interacoes.listarPorAtendimento(id);
    return { itens: itens.map(projetarInteracao) };
  }

  @AutenticadoBasta()
  @Get('atendimentos/:id/transferencias')
  async transferenciasDe(@Param('id') id: string, @Req() req: Request) {
    await this.consulta.exigirNoEscopo(id, req);
    return { itens: await this.transferencias.listarTransferencias(id) };
  }

  @RequerPermissao('atendimento:atender')
  @Post('atendimentos/:id/assumir')
  async assumir(@Param('id') id: string, @Req() req: Request) {
    const atualizado = await this.atendimentos.assumir(id, autor(req));
    return projetarAtendimento(atualizado, agoraUtc());
  }

  @RequerPermissao('atendimento:atender')
  @Post('atendimentos/:id/responder')
  responder(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    return this.respostas.registrarResposta(id, parse(responderAtendimentoSchema, body), autor(req), req);
  }

  @RequerPermissao('atendimento:transferir')
  @Post('atendimentos/:id/transferir')
  transferir(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    return this.transferencias.transferir(id, parse(transferirAtendimentoSchema, body), autor(req));
  }

  @RequerPermissao('atendimento:encerrar')
  @Post('atendimentos/:id/encerrar')
  async encerrar(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const dto = parse(encerrarAtendimentoSchema, body);
    const atualizado = await this.atendimentos.encerrar(id, autor(req), dto.motivo);
    return projetarAtendimento(atualizado, agoraUtc());
  }

  @RequerPermissao('atendimento:atender')
  @Post('atendimentos/:id/csat')
  registrarCsat(@Param('id') id: string, @Body() body: unknown) {
    return this.csat.registrarCsat(id, parse(registrarCsatSchema, body));
  }

  // ------------------------------------------------------- sugestão de IA (spec 013)

  @AutenticadoBasta()
  @Get('atendimentos/:id/sugestoes')
  async listarSugestoes(
    @Param('id') id: string,
    @Query() q: Record<string, unknown>,
    @Req() req: Request,
  ) {
    await this.consulta.exigirNoEscopo(id, req);
    const dto = parse(listarSugestoesSchema, q);
    return this.decidirSugestao.listar(id, dto.interacaoId);
  }

  @RequerPermissao('atendimento:atender')
  @Post('atendimentos/:id/sugestoes')
  gerarSugestoes(@Param('id') id: string, @Body() body: unknown) {
    const dto = parse(gerarSugestaoSchema, body);
    return this.gerarSugestao.gerar(id, dto.interacaoId);
  }

  @RequerPermissao('atendimento:atender')
  @Post('atendimentos/:id/sugestoes/:sugestaoId/aceitar')
  aceitarSugestao(
    @Param('sugestaoId') sugestaoId: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const dto = parse(aceitarSugestaoSchema, body);
    return this.decidirSugestao.aceitar(sugestaoId, dto.conteudoFinal, autor(req), req);
  }

  @RequerPermissao('atendimento:atender')
  @Post('atendimentos/:id/sugestoes/:sugestaoId/rejeitar')
  rejeitarSugestao(@Param('sugestaoId') sugestaoId: string, @Req() req: Request) {
    return this.decidirSugestao.rejeitar(sugestaoId, autor(req));
  }

  @RequerPermissao('atendimento:atender')
  @Post('atendimentos/:id/sugestoes/:sugestaoId/feedback')
  avaliarSugestao(
    @Param('sugestaoId') sugestaoId: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const dto = parse(feedbackSugestaoSchema, body);
    return this.decidirSugestao.avaliarUtilidade(sugestaoId, dto.util, autor(req));
  }
}
