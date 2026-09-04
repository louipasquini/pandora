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
import { AutenticadoBasta } from '../auth/rbac/decorators/autenticado-basta.decorator';
import { RequerPermissao } from '../auth/rbac/decorators/requer-permissao.decorator';
import { InteracaoService, projetarInteracao } from './application/interacao/interacao.service';
import { TagService } from './application/tag/tag.service';
import {
  criarInteracaoSchema,
  listarInteracoesSchema,
} from './dto/criar-interacao.schema';
import { editarInteracaoSchema } from './dto/editar-interacao.schema';
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
 * Timeline de `interacao` (spec 009). `POST`/`PATCH`/`DELETE` sob
 * `interacao:registrar` (a regra fina de mutabilidade — só `NOTA`, autor vs
 * `interacao:gerir` — mora no serviço). Leitura por pessoa (`crm/pessoas/:id/
 * interacoes`) exige `pessoa:ver`; por lead (`crm/leads/:id/interacoes`) é
 * `@AutenticadoBasta()` — o escopo `lead:ver_*` é resolvido no serviço via
 * `LeadConsultaService` (mesma regra da 008).
 */
@Controller('crm')
export class InteracaoController {
  constructor(
    private readonly interacoes: InteracaoService,
    private readonly tags: TagService,
  ) {}

  @RequerPermissao('interacao:registrar')
  @Post('interacoes')
  criar(@Body() body: unknown, @Req() req: Request) {
    return this.interacoes.criar(parse(criarInteracaoSchema, body), req);
  }

  @RequerPermissao('pessoa:ver')
  @Get('pessoas/:pessoaId/interacoes')
  listarPorPessoa(
    @Param('pessoaId') pessoaId: string,
    @Query() q: Record<string, unknown>,
  ) {
    return this.interacoes.listarPorPessoa(pessoaId, parse(listarInteracoesSchema, q));
  }

  @AutenticadoBasta()
  @Get('leads/:leadId/interacoes')
  listarPorLead(
    @Param('leadId') leadId: string,
    @Query() q: Record<string, unknown>,
    @Req() req: Request,
  ) {
    return this.interacoes.listarPorLead(leadId, parse(listarInteracoesSchema, q), req);
  }

  @AutenticadoBasta()
  @Get('interacoes/:id')
  async detalhe(@Param('id') id: string, @Req() req: Request) {
    return projetarInteracao(await this.interacoes.obterPorId(id, req));
  }

  @RequerPermissao('interacao:registrar')
  @Patch('interacoes/:id')
  editar(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const dto = parse(editarInteracaoSchema, body);
    return this.interacoes.editarNota(id, dto.conteudo, req);
  }

  @RequerPermissao('interacao:registrar')
  @HttpCode(200)
  @Delete('interacoes/:id')
  remover(@Param('id') id: string, @Req() req: Request) {
    return this.interacoes.removerNota(id, req);
  }

  @RequerPermissao('interacao:registrar')
  @Post('interacoes/:id/tags')
  async addTag(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    await this.interacoes.obterPorId(id, req); // 404 se a interação não existe/escopo
    const dto = parse(associarTagSchema, body);
    const r = await this.tags.associar({ tipo: 'interacao', id }, dto.tag, autor(req), autor(req));
    return { tags: r.tags };
  }

  @RequerPermissao('interacao:registrar')
  @HttpCode(200)
  @Delete('interacoes/:id/tags')
  async removerTag(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    await this.interacoes.obterPorId(id, req);
    const dto = parse(associarTagSchema, body);
    const r = await this.tags.desassociar({ tipo: 'interacao', id }, dto.tag, autor(req));
    return { tags: r.tags };
  }
}
