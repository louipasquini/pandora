import { BadRequestException, Body, Controller, Get, Param, Patch, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z, type ZodTypeAny } from 'zod';
import type { AuthContext } from '../auth/guards/jwt-auth.guard';
import { RequerPermissao } from '../auth/rbac/decorators/requer-permissao.decorator';
import { CrmAtendimentoEquipeService } from './application/atendimento';
import { configurarEquipeAtendimentoSchema } from './dto/atendimento/atendimento.schema';

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
 * Configuração administrativa de atendimento por equipe (spec 012, FR-021) —
 * SLA de 1ª resposta + mensagem fora do expediente. Leitura sob
 * `crm_admin:ver`, escrita sob `crm_admin:gerir_atendimento` (mesmo padrão
 * `crm_admin` da 007).
 */
@Controller('crm/admin/atendimento')
export class CrmAdminAtendimentoController {
  constructor(private readonly equipes: CrmAtendimentoEquipeService) {}

  @RequerPermissao('crm_admin:ver')
  @Get('equipes/:equipeId')
  obter(@Param('equipeId') equipeId: string) {
    return this.equipes.obter(equipeId);
  }

  @RequerPermissao('crm_admin:gerir_atendimento')
  @Patch('equipes/:equipeId')
  configurar(@Param('equipeId') equipeId: string, @Body() body: unknown, @Req() req: Request) {
    return this.equipes.configurar(equipeId, parse(configurarEquipeAtendimentoSchema, body), autor(req));
  }
}
