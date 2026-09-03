import { Injectable } from '@nestjs/common';
import {
  EntidadeId,
  OrigemMudanca,
  agoraUtc,
  montarRegistroAuditoria,
} from '../../core/core.module';
import { PrismaService } from '../../prisma/prisma.service';

export interface EntradaAuditoria {
  autor: string;
  entidadeId: string;
  /** eixo da mudança — nesta spec só `'reprocessar'`. */
  campo: string;
  valorAnterior: unknown;
  valorNovo: unknown;
  motivo: string;
}

/**
 * Auditoria do contexto `ingestao` (spec 006) — forma canônica `RegistroAuditoria`
 * do core (spec 002), `origem = AJUSTE_MANUAL`, `entidade = "evento_origem"`.
 * **Append-only** (sem UPDATE/DELETE). Simétrico ao `RbacAuditService` (004) e ao
 * `ClientesAuditService` (005). Grava **só o reprocessamento manual** — o worker
 * registra seu progresso em `evento_etapa` (log operacional), não aqui.
 */
@Injectable()
export class IngestaoAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(e: EntradaAuditoria): Promise<void> {
    const registro = montarRegistroAuditoria({
      autor: e.autor,
      quando: agoraUtc(),
      entidade: 'evento_origem',
      entidadeId: e.entidadeId,
      campo: e.campo,
      valorAnterior: e.valorAnterior,
      valorNovo: e.valorNovo,
      motivo: e.motivo,
      origem: OrigemMudanca.AJUSTE_MANUAL,
    });

    await this.prisma.ingestaoAudit.create({
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
  }
}
