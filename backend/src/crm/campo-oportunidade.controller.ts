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
import { CampoOportunidadeService } from './application/pipeline/campo-oportunidade.service';
import {
  criarCampoOportunidadeSchema,
  listarCamposOportunidadeSchema,
  patchCampoOportunidadeSchema,
} from './dto/campo-oportunidade.schema';

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
 * Definições de campo personalizado de oportunidade (spec 010, US6). Sob
 * `crm_admin:gerir_pipelines` — mesmo padrão de `CampoPersonalizadoController`
 * (008), trocando `lead` por `oportunidade`.
 */
@Controller('crm/admin/campos-oportunidade')
export class CampoOportunidadeController {
  constructor(private readonly campos: CampoOportunidadeService) {}

  @RequerPermissao('crm_admin:gerir_pipelines')
  @Get()
  listar(@Query() q: Record<string, unknown>) {
    const dto = parse(listarCamposOportunidadeSchema, q);
    return this.campos.listar(dto.ativo).then((itens) => ({ itens }));
  }

  @RequerPermissao('crm_admin:gerir_pipelines')
  @Get(':id')
  detalhe(@Param('id') id: string) {
    return this.campos.detalhe(id);
  }

  @RequerPermissao('crm_admin:gerir_pipelines')
  @Post()
  criar(@Body() body: unknown, @Req() req: Request) {
    return this.campos.criar(parse(criarCampoOportunidadeSchema, body), autor(req));
  }

  @RequerPermissao('crm_admin:gerir_pipelines')
  @Patch(':id')
  atualizar(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    return this.campos.atualizar(id, parse(patchCampoOportunidadeSchema, body), autor(req));
  }

  @RequerPermissao('crm_admin:gerir_pipelines')
  @HttpCode(204)
  @Delete(':id')
  async remover(@Param('id') id: string, @Req() req: Request) {
    await this.campos.remover(id, autor(req));
  }
}
