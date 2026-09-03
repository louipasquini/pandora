import { Injectable } from '@nestjs/common';
import {
  EntidadeId,
  OrigemMudanca,
  agoraUtc,
  montarRegistroAuditoria,
} from '../../core/core.module';
import { PrismaService } from '../../prisma/prisma.service';

export type EntidadeClientes = 'pessoa' | 'conta';

export interface EntradaAuditoria {
  autor: string;
  entidade: EntidadeClientes;
  entidadeId: string;
  /** eixo: 'criado' | 'editado' | 'conta_associada' | 'conta_desassociada' | 'merge' | 'merge_desfeito' */
  campo: string;
  valorAnterior: unknown;
  valorNovo: unknown;
  motivo: string;
}

/**
 * Auditoria do contexto `clientes` (spec 005) — forma canônica `RegistroAuditoria`
 * do core (spec 002), `origem = AJUSTE_MANUAL`. **Append-only**: sem UPDATE/DELETE.
 * Simétrico ao `RbacAuditService` da 004. Nunca recebe/grava segredo.
 *
 * `registrar` só grava quando há **delta real** — se `valorAnterior` e `valorNovo`
 * são estruturalmente iguais, é no-op.
 */
@Injectable()
export class ClientesAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(e: EntradaAuditoria): Promise<boolean> {
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

    await this.prisma.clientesAudit.create({
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
