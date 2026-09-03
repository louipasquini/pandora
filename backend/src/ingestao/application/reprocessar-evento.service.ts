import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { EtapaIngestao } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EventoRepository } from '../infra/evento.repository';
import { IngestaoAuditService } from './ingestao-audit.service';

/**
 * Reprocessamento manual de um evento (spec 006). Devolve as `evento_etapa`
 * não-`ok` a `pendente` (zera `tentativas`); `forcar` também reenfileira as
 * etapas 1–6 já `ok`. Grava **1** `ingestao_audit` (`AJUSTE_MANUAL`) — exceto
 * no-op (evento já todo `ok`, sem `forcar`). 409 se alguma etapa está
 * `processando`; 404 se o evento não existe.
 */
@Injectable()
export class ReprocessarEventoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: EventoRepository,
    private readonly audit: IngestaoAuditService,
  ) {}

  async reprocessar(
    eventoId: string,
    opts: { forcar: boolean },
    autor: string,
  ): Promise<{ eventoId: string; etapasReenfileiradas: EtapaIngestao[] }> {
    const evento = await this.prisma.eventoOrigem.findUnique({
      where: { id: eventoId },
      select: { id: true },
    });
    if (!evento) throw new NotFoundException('evento não encontrado');

    if (await this.repo.temEtapaProcessando(eventoId)) {
      throw new ConflictException('evento em processamento — tente de novo em instantes');
    }

    const etapasReenfileiradas = await this.repo.reenfileirar(eventoId, opts.forcar);

    if (etapasReenfileiradas.length > 0) {
      await this.audit.registrar({
        autor,
        entidadeId: eventoId,
        campo: 'reprocessar',
        valorAnterior: null,
        valorNovo: { etapasReenfileiradas, forcar: opts.forcar },
        motivo: opts.forcar
          ? 'reprocessamento manual forçado (todas as etapas)'
          : 'reprocessamento manual das etapas não concluídas',
      });
    }

    return { eventoId, etapasReenfileiradas };
  }
}
