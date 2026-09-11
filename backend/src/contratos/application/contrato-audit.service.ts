import { Injectable } from '@nestjs/common';
import { EntidadeId, OrigemMudanca, agoraUtc, montarRegistroAuditoria } from '../../core/core.module';
import { PrismaService } from '../../prisma/prisma.service';

export interface EntradaAuditoriaContrato {
  autor: string;
  entidadeId: string;
  campo: string;
  valorAnterior: unknown;
  valorNovo: unknown;
  motivo: string;
}

/**
 * Auditoria do contexto `contratos` (spec 025) — forma canônica `RegistroAuditoria`
 * do core, `origem = AJUSTE_MANUAL`. **Append-only** — mesmo padrão de
 * `CrmAdminAuditService`/`ClientesAuditService`. Grava **só quando há delta real**
 * (nenhuma linha para um `PATCH` no-op).
 */
@Injectable()
export class ContratoAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(e: EntradaAuditoriaContrato): Promise<boolean> {
    if (JSON.stringify(e.valorAnterior ?? null) === JSON.stringify(e.valorNovo ?? null)) {
      return false;
    }

    const registro = montarRegistroAuditoria({
      autor: e.autor,
      quando: agoraUtc(),
      entidade: 'contrato',
      entidadeId: e.entidadeId,
      campo: e.campo,
      valorAnterior: e.valorAnterior,
      valorNovo: e.valorNovo,
      motivo: e.motivo,
      origem: OrigemMudanca.AJUSTE_MANUAL,
    });

    await this.prisma.contratoAudit.create({
      data: {
        id: EntidadeId.novo().value,
        autor: registro.autor,
        quando: registro.quando,
        entidade: registro.entidade,
        entidadeId: registro.entidadeId,
        campo: registro.campo,
        valorAnterior: (registro.valorAnterior ?? null) as never,
        valorNovo: (registro.valorNovo ?? null) as never,
        motivo: registro.motivo,
        origem: registro.origem,
      },
    });
    return true;
  }
}
