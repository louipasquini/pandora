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
import { CrmLeadAuditService } from './application/lead/crm-lead-audit.service';
import { LeadConsultaService } from './application/lead/lead-consulta.service';
import { LeadConversaoService } from './application/lead/lead-conversao.service';
import { LeadScoreService } from './application/lead/lead-score.service';
import { LeadService } from './application/lead/lead.service';
import { ValorCampoService } from './application/lead/valor-campo.service';
import { criarLeadSchema } from './dto/criar-lead.schema';
import {
  atualizarLeadSchema,
  recalcularLoteSchema,
  tagSchema,
} from './dto/atualizar-lead.schema';
import { listarLeadsSchema } from './dto/listar-leads.schema';
import { valoresCamposSchema } from './dto/campo-personalizado.schema';

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

/** Extrai os pares `campo:<chave>=<valor>` do query-string. */
function camposFiltro(q: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(q)) {
    if (k.startsWith('campo:') && typeof v === 'string') {
      out[k.slice('campo:'.length)] = v;
    }
  }
  return out;
}

/**
 * Lead do CRM (spec 008). Leitura = `@AutenticadoBasta()` + gate "OU"
 * (`lead:ver_todos` | `lead:ver_proprios`) + escopo no `LeadConsultaService`.
 * Escrita = `@RequerPermissao`. Conversão exige `lead:editar` **e** `pessoa:editar`.
 * Sem `DELETE /crm/leads/:id` (FR-008).
 */
@Controller('crm/leads')
export class LeadController {
  constructor(
    private readonly leads: LeadService,
    private readonly consulta: LeadConsultaService,
    private readonly score: LeadScoreService,
    private readonly conversao: LeadConversaoService,
    private readonly valores: ValorCampoService,
    private readonly audit: CrmLeadAuditService,
  ) {}

  // ---------------------------------------------------------------- leitura

  @AutenticadoBasta()
  @Get()
  listar(@Query() q: Record<string, unknown>, @Req() req: Request) {
    const dto = parse(listarLeadsSchema, q);
    return this.consulta.listar(dto, camposFiltro(q), req);
  }

  @AutenticadoBasta()
  @Get(':id')
  detalhe(@Param('id') id: string, @Req() req: Request) {
    return this.consulta.obter(id, req);
  }

  @AutenticadoBasta()
  @Get(':id/auditoria')
  async auditoria(
    @Param('id') id: string,
    @Query() q: Record<string, unknown>,
    @Req() req: Request,
  ) {
    await this.consulta.exigirNoEscopo(id, req);
    const pagina = Number(q.pagina ?? 1) || 1;
    const tamanho = Math.min(Number(q.tamanho ?? 25) || 25, 100);
    return this.audit.listar({ entidadeId: id, pagina, tamanho });
  }

  @AutenticadoBasta()
  @Get(':id/campos-personalizados')
  campos(@Param('id') id: string, @Req() req: Request) {
    return this.valores.obter(id, req);
  }

  // ---------------------------------------------------------------- escrita

  @RequerPermissao('lead:criar')
  @Post()
  criar(@Body() body: unknown, @Req() req: Request) {
    return this.leads.criar(parse(criarLeadSchema, body), autor(req));
  }

  @RequerPermissao('lead:editar')
  @Patch(':id')
  atualizar(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    return this.leads.atualizar(id, parse(atualizarLeadSchema, body), autor(req), req);
  }

  @RequerPermissao('lead:editar')
  @Post(':id/tags')
  addTag(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    return this.leads.addTag(id, parse(tagSchema, body).tag, autor(req), req);
  }

  @RequerPermissao('lead:editar')
  @Delete(':id/tags')
  removerTag(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    return this.leads.removerTag(id, parse(tagSchema, body).tag, autor(req), req);
  }

  @RequerPermissao('lead:editar')
  @HttpCode(200)
  @Post(':id/recalcular-score')
  async recalcular(@Param('id') id: string, @Req() req: Request) {
    await this.consulta.exigirNoEscopo(id, req);
    return this.score.recalcularPorId(id, autor(req));
  }

  @RequerPermissao('lead:editar')
  @HttpCode(200)
  @Post('recalcular-score')
  recalcularLote(@Body() body: unknown, @Req() req: Request) {
    const dto = parse(recalcularLoteSchema, body ?? {});
    return this.score.recalcularLote(dto.cursor, dto.tamanho, autor(req));
  }

  @RequerPermissao('lead:editar')
  @Put(':id/campos-personalizados')
  putCampos(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    return this.valores.substituir(id, parse(valoresCamposSchema, body ?? {}), autor(req), req);
  }

  @RequerPermissao('lead:editar', 'pessoa:editar')
  @HttpCode(200)
  @Post(':id/converter')
  converter(@Param('id') id: string, @Req() req: Request) {
    return this.conversao.converter(id, autor(req), req);
  }
}
