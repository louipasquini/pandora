import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EntidadeId, agoraUtc } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';

export type SugestaoIaRow = Prisma.SugestaoIaGetPayload<Record<string, never>>;

export interface NovaSugestao {
  atendimentoId: string;
  interacaoOrigemId: string;
  tipo: 'RESPOSTA' | 'CAMPO_PERSONALIZADO';
  perguntaDetectada: string | null;
  faqItemId: string | null;
  campoPersonalizadoLeadId: string | null;
  campoPersonalizadoPessoaId: string | null;
  conteudoSugerido: string;
}

@Injectable()
export class SugestaoIaRepository {
  constructor(private readonly prisma: PrismaService) {}

  porId(id: string): Promise<SugestaoIaRow | null> {
    return this.prisma.sugestaoIa.findUnique({ where: { id } });
  }

  listarPorAtendimento(atendimentoId: string, interacaoId?: string): Promise<SugestaoIaRow[]> {
    return this.prisma.sugestaoIa.findMany({
      where: {
        atendimentoId,
        ...(interacaoId ? { interacaoOrigemId: interacaoId } : {}),
      },
      orderBy: [{ criadoEm: 'asc' }],
    });
  }

  /** D-05: sugestões PENDENTE da mesma mensagem viram SUBSTITUIDA. */
  async substituirPendentesDaInteracao(interacaoOrigemId: string): Promise<void> {
    await this.prisma.sugestaoIa.updateMany({
      where: { interacaoOrigemId, status: 'PENDENTE' },
      data: { status: 'SUBSTITUIDA', decididoEm: agoraUtc() },
    });
  }

  async criarLote(itens: NovaSugestao[]): Promise<SugestaoIaRow[]> {
    if (itens.length === 0) return [];
    const dados = itens.map((i) => ({ id: EntidadeId.novo().value, ...i }));
    await this.prisma.sugestaoIa.createMany({ data: dados });
    return this.prisma.sugestaoIa.findMany({
      where: { id: { in: dados.map((d) => d.id) } },
      orderBy: [{ criadoEm: 'asc' }],
    });
  }

  async marcarDecisao(
    id: string,
    dados: {
      status: 'ACEITA' | 'REJEITADA';
      conteudoFinal: string | null;
      decididoPorId: string;
    },
  ): Promise<SugestaoIaRow> {
    return this.prisma.sugestaoIa.update({
      where: { id },
      data: {
        status: dados.status,
        conteudoFinal: dados.conteudoFinal,
        decididoPorId: dados.decididoPorId,
        decididoEm: agoraUtc(),
      },
    });
  }

  async marcarFeedback(id: string, util: boolean, autorId: string): Promise<SugestaoIaRow> {
    return this.prisma.sugestaoIa.update({
      where: { id },
      data: { util, utilRegistradoPorId: autorId, utilRegistradoEm: agoraUtc() },
    });
  }
}
