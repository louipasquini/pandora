import { Injectable } from '@nestjs/common';
import { Prisma, type DisparoVariante, type MensagemDisparoStatus } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

export type MensagemDisparoRow = Prisma.MensagemDisparoGetPayload<Record<string, never>>;

export interface NovaMensagemDisparo {
  execucaoDisparoId: string;
  telefone: string;
  pessoaId: string | null;
  leadId: string | null;
  variante: DisparoVariante | null;
  status: MensagemDisparoStatus;
  motivo: string | null;
}

@Injectable()
export class MensagemDisparoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async criarLote(linhas: NovaMensagemDisparo[]): Promise<number> {
    if (linhas.length === 0) return 0;
    const r = await this.prisma.mensagemDisparo.createMany({
      data: linhas.map((l) => ({ id: EntidadeId.novo().value, ...l })),
      skipDuplicates: true,
    });
    return r.count;
  }

  porId(id: string): Promise<MensagemDisparoRow | null> {
    return this.prisma.mensagemDisparo.findUnique({ where: { id } });
  }

  /**
   * Lote de linhas `PENDENTE` para o worker enviar (spec 015, D-R4 do
   * research.md — o próprio tamanho do lote por passada É o throttling).
   * Ordenado por `criadoEm` para um envio previsível (FIFO).
   */
  pendentesParaEnvio(lote: number): Promise<MensagemDisparoRow[]> {
    return this.prisma.mensagemDisparo.findMany({
      where: { status: 'PENDENTE' },
      orderBy: [{ criadoEm: 'asc' }],
      take: lote,
    });
  }

  existemPendentes(execucaoDisparoId: string): Promise<boolean> {
    return this.prisma.mensagemDisparo
      .count({ where: { execucaoDisparoId, status: { in: ['PENDENTE', 'ENVIANDO'] } } })
      .then((n) => n > 0);
  }

  /** Reserva a linha para envio (evita 2 workers pegarem a mesma) — mutex por item. */
  async marcarEnviando(id: string): Promise<boolean> {
    const r = await this.prisma.mensagemDisparo.updateMany({
      where: { id, status: 'PENDENTE' },
      data: { status: 'ENVIANDO' },
    });
    return r.count === 1;
  }

  async marcarEnviada(id: string, mensagemWhatsappId: string | null): Promise<void> {
    await this.prisma.mensagemDisparo.update({
      where: { id },
      data: { status: 'ENVIADA', mensagemWhatsappId, motivo: null },
    });
  }

  /** Falha retentável — volta para `PENDENTE` (tentativa consumida) ou termina em `FALHOU`. */
  async registrarFalhaRetentavel(
    id: string,
    motivo: string,
    tentativas: number,
    maxTentativas: number,
  ): Promise<void> {
    await this.prisma.mensagemDisparo.update({
      where: { id },
      data: {
        tentativas,
        status: tentativas >= maxTentativas ? 'FALHOU' : 'PENDENTE',
        motivo,
      },
    });
  }

  /** Falha/pulo terminal, sem consumir tentativa (opt-out, telefone inválido, etc.). */
  async marcarTerminalSemRetry(
    id: string,
    status: 'FALHOU' | 'PULADA',
    motivo: string,
  ): Promise<void> {
    await this.prisma.mensagemDisparo.update({ where: { id }, data: { status, motivo } });
  }

  async listarPorExecucao(
    execucaoDisparoId: string,
    opts: { pagina: number; tamanho: number; status?: MensagemDisparoStatus },
  ): Promise<{ itens: MensagemDisparoRow[]; total: number }> {
    const where: Prisma.MensagemDisparoWhereInput = {
      execucaoDisparoId,
      ...(opts.status ? { status: opts.status } : {}),
    };
    const [itens, total] = await this.prisma.$transaction([
      this.prisma.mensagemDisparo.findMany({
        where,
        orderBy: [{ criadoEm: 'asc' }],
        skip: (opts.pagina - 1) * opts.tamanho,
        take: opts.tamanho,
      }),
      this.prisma.mensagemDisparo.count({ where }),
    ]);
    return { itens, total };
  }

  /** Todas as linhas de uma execução — usado por export (volume até poucos milhares). */
  listarTodasPorExecucao(execucaoDisparoId: string): Promise<MensagemDisparoRow[]> {
    return this.prisma.mensagemDisparo.findMany({
      where: { execucaoDisparoId },
      orderBy: [{ criadoEm: 'asc' }],
    });
  }
}
