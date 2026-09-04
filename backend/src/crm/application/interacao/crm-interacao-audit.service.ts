import { Injectable } from '@nestjs/common';
import {
  EntidadeId,
  OrigemMudanca,
  agoraUtc,
  montarRegistroAuditoria,
} from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';
import type { EntradaAuditoriaInteracao } from '../../domain/interacao/tipos';

/**
 * Auditoria de `interacao`, `tag_associacao` (pessoa\|interacao) e `segmento`
 * (spec 009) — forma canônica `RegistroAuditoria` do core (spec 002),
 * `origem = AJUSTE_MANUAL`. **Append-only**. Simétrico a `CrmLeadAuditService`
 * (008) e `CrmAdminAuditService` (007). Tag em `lead` continua em
 * `crm_lead_audit` (contrato 008 preservado); catálogo de tag (admin) vai para
 * `crm_admin_audit` (007).
 *
 * Grava **só quando há delta real** (`jsonIgual(anterior, novo)` → no-op → `false`).
 */
@Injectable()
export class CrmInteracaoAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(e: EntradaAuditoriaInteracao): Promise<boolean> {
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

    await this.prisma.crmInteracaoAudit.create({
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

  async listar(filtro: {
    entidade?: string;
    entidadeId?: string;
    pagina: number;
    tamanho: number;
  }): Promise<{ itens: unknown[]; pagina: number; tamanho: number; total: number }> {
    const where = {
      ...(filtro.entidade ? { entidade: filtro.entidade } : {}),
      ...(filtro.entidadeId ? { entidadeId: filtro.entidadeId } : {}),
    };
    const [itens, total] = await this.prisma.$transaction([
      this.prisma.crmInteracaoAudit.findMany({
        where,
        orderBy: [{ quando: 'desc' }, { id: 'desc' }],
        skip: (filtro.pagina - 1) * filtro.tamanho,
        take: filtro.tamanho,
      }),
      this.prisma.crmInteracaoAudit.count({ where }),
    ]);
    return { itens, pagina: filtro.pagina, tamanho: filtro.tamanho, total };
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
