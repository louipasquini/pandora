import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EntidadeId } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

export type AtendimentoRow = Prisma.AtendimentoGetPayload<Record<string, never>>;

export interface CriarAtendimentoDados {
  pessoaId: string | null;
  leadId: string | null;
  canal: 'WHATSAPP' | 'MANUAL';
  canalWhatsappId: string | null;
  equipeId: string | null;
  atendenteAtualId: string | null;
  status: 'AGUARDANDO' | 'EM_ATENDIMENTO';
  slaMinutos: number;
  abertoEm: Date;
}

export interface ListarAtendimentosFiltro {
  status?: readonly ('AGUARDANDO' | 'EM_ATENDIMENTO' | 'ENCERRADO')[];
  prioridade?: 'NORMAL' | 'ALTA' | 'URGENTE';
  equipeId?: string;
  atendenteAtualId?: string;
}

@Injectable()
export class AtendimentoRepository {
  constructor(private readonly prisma: PrismaService) {}

  porId(id: string): Promise<AtendimentoRow | null> {
    return this.prisma.atendimento.findUnique({ where: { id } });
  }

  /** Atendimento ainda aberto (AGUARDANDO|EM_ATENDIMENTO) para a mesma âncora+canal (FR-002). */
  atendimentoAbertoPorAncoraECanal(
    ancora: { pessoaId?: string | null; leadId?: string | null },
    canal: 'WHATSAPP' | 'MANUAL',
    canalWhatsappId: string | null,
  ): Promise<AtendimentoRow | null> {
    return this.prisma.atendimento.findFirst({
      where: {
        pessoaId: ancora.pessoaId ?? undefined,
        leadId: ancora.leadId ?? undefined,
        canal,
        canalWhatsappId: canalWhatsappId ?? undefined,
        status: { in: ['AGUARDANDO', 'EM_ATENDIMENTO'] },
      },
      orderBy: { abertoEm: 'desc' },
    });
  }

  /** Atendimento ENCERRADO mais recente da âncora+canal, elegível para CSAT (D-R5). */
  atendimentoEncerradoElegivelCsat(
    ancora: { pessoaId?: string | null; leadId?: string | null },
    canal: 'WHATSAPP' | 'MANUAL',
  ): Promise<AtendimentoRow | null> {
    return this.prisma.atendimento.findFirst({
      where: {
        pessoaId: ancora.pessoaId ?? undefined,
        leadId: ancora.leadId ?? undefined,
        canal,
        status: 'ENCERRADO',
        csatSolicitadoEm: { not: null },
      },
      orderBy: { encerradoEm: 'desc' },
    });
  }

  async criar(dados: CriarAtendimentoDados): Promise<AtendimentoRow> {
    return this.prisma.atendimento.create({
      data: { id: EntidadeId.novo().value, ...dados },
    });
  }

  async atualizar(id: string, dados: Prisma.AtendimentoUncheckedUpdateInput): Promise<AtendimentoRow> {
    return this.prisma.atendimento.update({ where: { id }, data: dados });
  }

  /** Carga AO VIVO — contagem de EM_ATENDIMENTO por atendente, entre os usuários informados. */
  async contarCargaPorUsuario(usuarioIds: readonly string[]): Promise<Map<string, number>> {
    if (usuarioIds.length === 0) return new Map();
    const grupos = await this.prisma.atendimento.groupBy({
      by: ['atendenteAtualId'],
      where: { atendenteAtualId: { in: [...usuarioIds] }, status: 'EM_ATENDIMENTO' },
      _count: { _all: true },
    });
    const mapa = new Map<string, number>(usuarioIds.map((id) => [id, 0]));
    for (const g of grupos) {
      if (g.atendenteAtualId) mapa.set(g.atendenteAtualId, g._count._all);
    }
    return mapa;
  }

  /**
   * `where` já vem composto (escopo de visão + filtros de query — mesmo
   * padrão de `OportunidadeRepository`). Ordenação/prioridade final é
   * aplicada em memória via `ordenarFila` (domínio puro) pelo chamador —
   * volume baixo (CL-02), aqui só um teto de segurança.
   */
  async listar(where: Prisma.AtendimentoWhereInput): Promise<AtendimentoRow[]> {
    return this.prisma.atendimento.findMany({ where, take: 500 });
  }

  static filtro(f: ListarAtendimentosFiltro): Prisma.AtendimentoWhereInput {
    return {
      ...(f.status ? { status: { in: [...f.status] } } : {}),
      ...(f.prioridade ? { prioridade: f.prioridade } : {}),
      ...(f.equipeId ? { equipeId: f.equipeId } : {}),
      ...(f.atendenteAtualId ? { atendenteAtualId: f.atendenteAtualId } : {}),
    };
  }

  async marcarInteracaoDoAtendimento(interacaoId: string, atendimentoId: string): Promise<void> {
    await this.prisma.interacao.update({
      where: { id: interacaoId },
      data: { atendimentoId },
    });
  }

  existeInteracaoDeSaidaAutomatica(atendimentoId: string): Promise<boolean> {
    return this.prisma.interacao
      .findFirst({
        where: { atendimentoId, direcao: 'SAIDA', autorId: null },
        select: { id: true },
      })
      .then((r) => r != null);
  }
}
