import { BadRequestException, Body, Controller, Get, Param, Patch, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from '../auth/guards/jwt-auth.guard';
import { RequerPermissao } from '../auth/rbac/decorators/requer-permissao.decorator';
import { AjustarContratoService } from './application/ajustar-contrato.service';
import { ContratoQueryService } from './application/contrato-query.service';
import { ajustarContratoSchema } from './dto/ajustar-contrato.schema';
import { listarContratosSchema } from './dto/listar-contratos.schema';

function autor(req: Request): string {
  return (req as Request & { auth?: AuthContext }).auth?.sub ?? 'desconhecido';
}

/**
 * `/contratos` (spec 025). `contrato`/`aditivo` só nascem/mudam pelo pipeline de
 * ingestão (Princípio VIII) — o único endpoint de escrita aqui é o ajuste
 * manual curado, nunca criação/exclusão. Leitura sob `contrato:ver`; ajuste sob
 * `contrato:editar`. 401 (sem token) ≠ 403 (sem permissão).
 */
@Controller('contratos')
export class ContratoController {
  constructor(
    private readonly query: ContratoQueryService,
    private readonly ajustar: AjustarContratoService,
  ) {}

  @RequerPermissao('contrato:ver')
  @Get()
  listar(@Query() q: Record<string, unknown>) {
    const parsed = listarContratosSchema.safeParse(q);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'query inválida',
        detalhes: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
    }
    return this.query.listar(parsed.data);
  }

  @RequerPermissao('contrato:ver')
  @Get(':id')
  ver(@Param('id') id: string) {
    return this.query.detalhe(id);
  }

  @RequerPermissao('contrato:editar')
  @Patch(':id')
  ajustarUm(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const parsed = ajustarContratoSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'corpo inválido',
        detalhes: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
    }
    return this.ajustar.ajustar(id, autor(req), parsed.data);
  }
}
