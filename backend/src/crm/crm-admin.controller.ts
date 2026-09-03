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
import { EquipeService } from './application/equipe.service';
import { ExpedienteService } from './application/expediente.service';
import { IntegracaoService } from './application/integracao.service';
import { CrmAdminAuditService } from './application/crm-admin-audit.service';
import {
  criarEquipeSchema,
  listarEquipesSchema,
  patchEquipeSchema,
} from './dto/equipe.schema';
import { adicionarMembroSchema, trocarPapelSchema } from './dto/membro.schema';
import {
  criarJanelaSchema,
  listarJanelasSchema,
  patchJanelaSchema,
} from './dto/janela.schema';
import {
  criarFeriadoSchema,
  listarFeriadosSchema,
  patchFeriadoSchema,
} from './dto/feriado.schema';
import { consultarExpedienteSchema } from './dto/consultar-expediente.schema';
import {
  criarIntegracaoSchema,
  listarIntegracoesSchema,
  patchIntegracaoSchema,
  rotacionarSchema,
} from './dto/integracao.schema';
import { listarAuditoriaSchema } from './dto/auditoria.schema';

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
 * Administração do CRM (spec 007). Leitura sob `crm_admin:ver`; escrita sob a
 * permissão `crm_admin:gerir_*` do subdomínio. Nenhuma rota pública.
 */
@Controller('crm/admin')
export class CrmAdminController {
  constructor(
    private readonly equipes: EquipeService,
    private readonly expediente: ExpedienteService,
    private readonly integracoes: IntegracaoService,
    private readonly audit: CrmAdminAuditService,
  ) {}

  // ------------------------------------------------------------ equipes

  @RequerPermissao('crm_admin:ver')
  @Get('equipes')
  listarEquipes(@Query() q: Record<string, unknown>) {
    return this.equipes.listar(parse(listarEquipesSchema, q));
  }

  @RequerPermissao('crm_admin:ver')
  @Get('equipes/:id')
  verEquipe(@Param('id') id: string) {
    return this.equipes.detalhe(id);
  }

  @RequerPermissao('crm_admin:gerir_equipes')
  @Post('equipes')
  @HttpCode(201)
  criarEquipe(@Body() body: unknown, @Req() req: Request) {
    return this.equipes.criar(parse(criarEquipeSchema, body), autor(req));
  }

  @RequerPermissao('crm_admin:gerir_equipes')
  @Patch('equipes/:id')
  patchEquipe(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    return this.equipes.patch(id, parse(patchEquipeSchema, body), autor(req));
  }

  @RequerPermissao('crm_admin:gerir_equipes')
  @Post('equipes/:id/membros')
  @HttpCode(201)
  adicionarMembro(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    return this.equipes.adicionarMembro(
      id,
      parse(adicionarMembroSchema, body),
      autor(req),
    );
  }

  @RequerPermissao('crm_admin:gerir_equipes')
  @Patch('equipes/:id/membros/:usuarioId')
  trocarPapel(
    @Param('id') id: string,
    @Param('usuarioId') usuarioId: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    return this.equipes.trocarPapel(
      id,
      usuarioId,
      parse(trocarPapelSchema, body),
      autor(req),
    );
  }

  @RequerPermissao('crm_admin:gerir_equipes')
  @Delete('equipes/:id/membros/:usuarioId')
  @HttpCode(204)
  async removerMembro(
    @Param('id') id: string,
    @Param('usuarioId') usuarioId: string,
    @Req() req: Request,
  ) {
    await this.equipes.removerMembro(id, usuarioId, autor(req));
  }

  // -------------------------------------------------------- expediente

  @RequerPermissao('crm_admin:ver')
  @Get('janelas-atendimento')
  listarJanelas(@Query() q: Record<string, unknown>) {
    return this.expediente.listarJanelas(parse(listarJanelasSchema, q));
  }

  @RequerPermissao('crm_admin:gerir_expediente')
  @Post('janelas-atendimento')
  @HttpCode(201)
  criarJanela(@Body() body: unknown, @Req() req: Request) {
    return this.expediente.criarJanela(parse(criarJanelaSchema, body), autor(req));
  }

  @RequerPermissao('crm_admin:gerir_expediente')
  @Patch('janelas-atendimento/:id')
  patchJanela(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    return this.expediente.patchJanela(id, parse(patchJanelaSchema, body), autor(req));
  }

  @RequerPermissao('crm_admin:gerir_expediente')
  @Delete('janelas-atendimento/:id')
  @HttpCode(204)
  async removerJanela(@Param('id') id: string, @Req() req: Request) {
    await this.expediente.removerJanela(id, autor(req));
  }

  @RequerPermissao('crm_admin:ver')
  @Get('feriados')
  listarFeriados(@Query() q: Record<string, unknown>) {
    return this.expediente.listarFeriados(parse(listarFeriadosSchema, q));
  }

  @RequerPermissao('crm_admin:gerir_expediente')
  @Post('feriados')
  @HttpCode(201)
  criarFeriado(@Body() body: unknown, @Req() req: Request) {
    return this.expediente.criarFeriado(parse(criarFeriadoSchema, body), autor(req));
  }

  @RequerPermissao('crm_admin:gerir_expediente')
  @Patch('feriados/:id')
  patchFeriado(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    return this.expediente.patchFeriado(id, parse(patchFeriadoSchema, body), autor(req));
  }

  @RequerPermissao('crm_admin:gerir_expediente')
  @Delete('feriados/:id')
  @HttpCode(204)
  async removerFeriado(@Param('id') id: string, @Req() req: Request) {
    await this.expediente.removerFeriado(id, autor(req));
  }

  @RequerPermissao('crm_admin:ver')
  @Get('expediente')
  consultarExpediente(@Query() q: Record<string, unknown>) {
    return this.expediente.consultar(parse(consultarExpedienteSchema, q));
  }

  // -------------------------------------------------------- integrações

  @RequerPermissao('crm_admin:ver')
  @Get('integracoes')
  listarIntegracoes(@Query() q: Record<string, unknown>) {
    return this.integracoes.listar(parse(listarIntegracoesSchema, q));
  }

  @RequerPermissao('crm_admin:ver')
  @Get('integracoes/:id')
  verIntegracao(@Param('id') id: string) {
    return this.integracoes.obter(id);
  }

  @RequerPermissao('crm_admin:gerir_integracoes')
  @Post('integracoes')
  @HttpCode(201)
  criarIntegracao(@Body() body: unknown, @Req() req: Request) {
    return this.integracoes.criar(parse(criarIntegracaoSchema, body), autor(req));
  }

  @RequerPermissao('crm_admin:gerir_integracoes')
  @Patch('integracoes/:id')
  patchIntegracao(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    return this.integracoes.atualizar(
      id,
      parse(patchIntegracaoSchema, body),
      autor(req),
    );
  }

  @RequerPermissao('crm_admin:gerir_integracoes')
  @Post('integracoes/:id/rotacionar')
  @HttpCode(200)
  rotacionarIntegracao(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    return this.integracoes.rotacionar(id, parse(rotacionarSchema, body ?? {}), autor(req));
  }

  // -------------------------------------------------------- auditoria (local)

  @RequerPermissao('crm_admin:ver')
  @Get('auditoria')
  listarAuditoria(@Query() q: Record<string, unknown>) {
    return this.audit.listar(parse(listarAuditoriaSchema, q));
  }
}
