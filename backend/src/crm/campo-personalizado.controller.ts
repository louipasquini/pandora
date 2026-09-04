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
import { CampoPersonalizadoService } from './application/lead/campo-personalizado.service';
import {
  criarCampoDefSchema,
  listarCamposDefSchema,
  patchCampoDefSchema,
} from './dto/campo-personalizado.schema';

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
 * Definições de campo personalizado de lead (spec 008, US5 — CL-03). Fica sob a
 * Administração do CRM (`/crm/admin/campos-lead`), permissão
 * `crm_admin:gerir_campos_lead`. Auditado em `crm_admin_audit` (007).
 */
@Controller('crm/admin/campos-lead')
export class CampoPersonalizadoController {
  constructor(private readonly svc: CampoPersonalizadoService) {}

  @RequerPermissao('crm_admin:gerir_campos_lead')
  @Get()
  listar(@Query() q: Record<string, unknown>) {
    const { ativo } = parse(listarCamposDefSchema, q);
    return this.svc.listar(ativo);
  }

  @RequerPermissao('crm_admin:gerir_campos_lead')
  @Get(':id')
  detalhe(@Param('id') id: string) {
    return this.svc.detalhe(id);
  }

  @RequerPermissao('crm_admin:gerir_campos_lead')
  @Post()
  criar(@Body() body: unknown, @Req() req: Request) {
    return this.svc.criar(parse(criarCampoDefSchema, body), autor(req));
  }

  @RequerPermissao('crm_admin:gerir_campos_lead')
  @Patch(':id')
  atualizar(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    return this.svc.atualizar(id, parse(patchCampoDefSchema, body), autor(req));
  }

  @RequerPermissao('crm_admin:gerir_campos_lead')
  @HttpCode(204)
  @Delete(':id')
  async remover(@Param('id') id: string, @Req() req: Request) {
    await this.svc.remover(id, autor(req));
  }
}
