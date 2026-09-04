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
import { AutenticadoBasta } from '../auth/rbac/decorators/autenticado-basta.decorator';
import { RequerPermissao } from '../auth/rbac/decorators/requer-permissao.decorator';
import { MoverOportunidadeService } from './application/pipeline/mover-oportunidade.service';
import { OportunidadeConsultaService } from './application/pipeline/oportunidade-consulta.service';
import { OportunidadeService } from './application/pipeline/oportunidade.service';
import { ValorCampoOportunidadeService } from './application/pipeline/valor-campo-oportunidade.service';
import {
  atualizarOportunidadeSchema,
  criarOportunidadeSchema,
  listarOportunidadesSchema,
  moverOportunidadeSchema,
} from './dto/oportunidade.schema';
import { valoresCamposOportunidadeSchema } from './dto/campo-oportunidade.schema';

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
 * `oportunidade` (spec 010, US1/US2/US3/US6). Leitura sob escopo
 * `ver_todas`\|`ver_proprias` (`@AutenticadoBasta()` + gate no serviço,
 * mesmo padrão da 008); escrita sob `oportunidade:{criar,editar,mover}`.
 */
@Controller('crm')
export class OportunidadeController {
  constructor(
    private readonly oportunidades: OportunidadeService,
    private readonly consulta: OportunidadeConsultaService,
    private readonly mover: MoverOportunidadeService,
    private readonly camposValores: ValorCampoOportunidadeService,
  ) {}

  @RequerPermissao('oportunidade:criar')
  @Post('oportunidades')
  criar(@Body() body: unknown, @Req() req: Request) {
    return this.oportunidades.criar(parse(criarOportunidadeSchema, body), autor(req));
  }

  @AutenticadoBasta()
  @Get('oportunidades')
  listar(@Query() q: Record<string, unknown>, @Req() req: Request) {
    return this.consulta.listar(parse(listarOportunidadesSchema, q), req);
  }

  @AutenticadoBasta()
  @Get('oportunidades/:id')
  detalhe(@Param('id') id: string, @Req() req: Request) {
    return this.consulta.obter(id, req);
  }

  @RequerPermissao('oportunidade:editar')
  @Patch('oportunidades/:id')
  async atualizar(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    await this.consulta.exigirNoEscopo(id, req);
    return this.oportunidades.atualizar(id, parse(atualizarOportunidadeSchema, body), autor(req));
  }

  @RequerPermissao('oportunidade:mover')
  @Post('oportunidades/:id/mover')
  mover_(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    return this.mover.mover(id, parse(moverOportunidadeSchema, body), req);
  }

  @AutenticadoBasta()
  @Get('oportunidades/:id/movimentacoes')
  async movimentacoes(@Param('id') id: string, @Req() req: Request) {
    const itens = await this.mover.listarMovimentacoes(id, req);
    return { itens };
  }

  @AutenticadoBasta()
  @Get('oportunidades/:id/campos-personalizados')
  camposPersonalizados(@Param('id') id: string, @Req() req: Request) {
    return this.camposValores.obter(id, req);
  }

  @RequerPermissao('oportunidade:editar')
  @Put('oportunidades/:id/campos-personalizados')
  substituirCampos(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const dto = parse(valoresCamposOportunidadeSchema, body);
    return this.camposValores.substituir(id, dto, autor(req), req);
  }

  @RequerPermissao('pessoa:ver')
  @Get('pessoas/:pessoaId/oportunidades')
  listarPorPessoa(@Param('pessoaId') pessoaId: string, @Req() req: Request) {
    return this.consulta.listarPorPessoa(pessoaId, req);
  }

  @AutenticadoBasta()
  @Get('leads/:leadId/oportunidades')
  listarPorLead(@Param('leadId') leadId: string, @Req() req: Request) {
    return this.consulta.listarPorLead(leadId, req);
  }
}
