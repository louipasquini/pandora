import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { EntidadeId } from '../../core/core.module';
import { PrismaService } from '../../prisma/prisma.service';

export interface EntradaNota {
  entidade: 'pessoa' | 'conta';
  entidadeId: string;
  origem: 'resolver_ou_criar' | 'merge_desfeito';
  campo: string;
  valorCurado?: unknown;
  valorDerivado?: unknown;
  motivo: 'primario_curado' | 'divergiu_pos_merge';
}

/**
 * `nota_reconciliacao` (spec 005) — registrada quando a derivação (`resolverOuCriar`)
 * ou o desfazer-merge encontraria um campo curado divergente: o valor curado
 * **prevalece** e a nota fica de rastro (Princípio VII). Append-only. Separada da
 * auditoria (`clientes_audit`) — leitores diferentes (027 / 053).
 */
@Injectable()
export class NotaReconciliacaoService {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(
    e: EntradaNota,
    tx: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await tx.notaReconciliacao.create({
      data: {
        id: EntidadeId.novo().value,
        entidade: e.entidade,
        entidadeId: e.entidadeId,
        origem: e.origem,
        campo: e.campo,
        valorCurado: (e.valorCurado ?? null) as never,
        valorDerivado: (e.valorDerivado ?? null) as never,
        motivo: e.motivo,
      },
    });
  }
}
