import { Injectable } from '@nestjs/common';
import {
  EntidadeId,
  OrigemMudanca,
  agoraUtc,
  montarRegistroAuditoria,
} from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

export interface EntradaAuditoriaTarefa {
  autor: string;
  entidade: string;
  entidadeId: string;
  campo: string;
  valorAnterior: unknown;
  valorNovo: unknown;
  motivo: string;
}

/**
 * Auditoria de `tarefa` (título, descrição, prazo, âncoras, status) — forma
 * canônica `RegistroAuditoria` do core, `origem = AJUSTE_MANUAL`,
 * **append-only** (spec 016, FR-015). Espelha `CrmPipelineAuditService` (010).
 * Delegação **não** duplica aqui — `tarefa_delegacao` já é o histórico de 1ª
 * classe (D-06). Grava só quando há delta real.
 */
@Injectable()
export class CrmTarefaAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(e: EntradaAuditoriaTarefa): Promise<boolean> {
    if (jsonIgual(e.valorAnterior, e.valorNovo)) return false;

    const registro = montarRegistroAuditoria({
      autor: e.autor,
      quando: agoraUtc(),
      entidade: e.entidade,
      entidadeId: e.entidadeId,
      campo: e.campo,
      valorAnterior: e.valorAnterior,
      valorNovo: e.valorNovo,
      motivo: e.motivo,
      origem: OrigemMudanca.AJUSTE_MANUAL,
    });

    await this.prisma.crmTarefaAudit.create({
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

function jsonIgual(a: unknown, b: unknown): boolean {
  return JSON.stringify(normaliza(a)) === JSON.stringify(normaliza(b));
}
function normaliza(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(normaliza);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return Object.keys(o)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = normaliza(o[k]);
        return acc;
      }, {});
  }
  return v;
}
