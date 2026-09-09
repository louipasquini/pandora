import { Injectable } from '@nestjs/common';
import { Prisma, FluxoGatilhoTipo, FluxoVersaoStatus } from '@prisma/client';
import { EntidadeId, agoraUtc } from '../../../core/core.module';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AcaoFluxo, CondicaoNo } from '../../domain/workflow';

export type FluxoRow = Prisma.FluxoAutomacaoGetPayload<Record<string, never>>;
export type FluxoVersaoRow = Prisma.FluxoAutomacaoVersaoGetPayload<Record<string, never>>;

export interface ConteudoVersao {
  gatilhoTipo: FluxoGatilhoTipo;
  condicoes: CondicaoNo;
  acoes: AcaoFluxo[];
}

@Injectable()
export class FluxoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async criarComRascunho(
    dados: { nome: string; descricao: string | null; criadoPor: string | null } & ConteudoVersao,
  ): Promise<{ fluxo: FluxoRow; versao: FluxoVersaoRow }> {
    const fluxo = await this.prisma.fluxoAutomacao.create({
      data: {
        id: EntidadeId.novo().value,
        nome: dados.nome,
        descricao: dados.descricao,
        criadoPor: dados.criadoPor,
      },
    });
    const versao = await this.prisma.fluxoAutomacaoVersao.create({
      data: {
        id: EntidadeId.novo().value,
        fluxoId: fluxo.id,
        numero: 1,
        status: FluxoVersaoStatus.RASCUNHO,
        gatilhoTipo: dados.gatilhoTipo,
        condicoes: dados.condicoes as unknown as Prisma.InputJsonValue,
        acoes: dados.acoes as unknown as Prisma.InputJsonValue,
        autor: dados.criadoPor,
      },
    });
    return { fluxo, versao };
  }

  fluxoPorId(id: string): Promise<FluxoRow | null> {
    return this.prisma.fluxoAutomacao.findUnique({ where: { id } });
  }

  async atualizarMetadado(
    id: string,
    dados: { nome?: string; descricao?: string | null },
  ): Promise<FluxoRow> {
    return this.prisma.fluxoAutomacao.update({ where: { id }, data: dados });
  }

  listar(filtro: { gatilhoTipo?: FluxoGatilhoTipo }): Promise<FluxoRow[]> {
    return this.prisma.fluxoAutomacao.findMany({
      where: filtro.gatilhoTipo
        ? { versoes: { some: { gatilhoTipo: filtro.gatilhoTipo } } }
        : undefined,
      orderBy: [{ criadoEm: 'desc' }],
    });
  }

  rascunhoAtual(fluxoId: string): Promise<FluxoVersaoRow | null> {
    return this.prisma.fluxoAutomacaoVersao.findFirst({
      where: { fluxoId, status: FluxoVersaoStatus.RASCUNHO },
    });
  }

  publicadaAtual(fluxoId: string): Promise<FluxoVersaoRow | null> {
    return this.prisma.fluxoAutomacaoVersao.findFirst({
      where: { fluxoId, status: FluxoVersaoStatus.PUBLICADA },
    });
  }

  versaoPorId(id: string): Promise<FluxoVersaoRow | null> {
    return this.prisma.fluxoAutomacaoVersao.findUnique({ where: { id } });
  }

  listarVersoes(fluxoId: string): Promise<FluxoVersaoRow[]> {
    return this.prisma.fluxoAutomacaoVersao.findMany({
      where: { fluxoId },
      orderBy: [{ numero: 'desc' }],
    });
  }

  /** Cria o rascunho se não existir; do contrário substitui seu conteúdo in-place. */
  async substituirRascunho(
    fluxoId: string,
    dados: ConteudoVersao & { autor: string | null },
  ): Promise<FluxoVersaoRow> {
    const existente = await this.rascunhoAtual(fluxoId);
    if (existente) {
      return this.prisma.fluxoAutomacaoVersao.update({
        where: { id: existente.id },
        data: {
          gatilhoTipo: dados.gatilhoTipo,
          condicoes: dados.condicoes as unknown as Prisma.InputJsonValue,
          acoes: dados.acoes as unknown as Prisma.InputJsonValue,
          autor: dados.autor,
        },
      });
    }
    const ultima = await this.prisma.fluxoAutomacaoVersao.findFirst({
      where: { fluxoId },
      orderBy: [{ numero: 'desc' }],
      select: { numero: true },
    });
    return this.prisma.fluxoAutomacaoVersao.create({
      data: {
        id: EntidadeId.novo().value,
        fluxoId,
        numero: (ultima?.numero ?? 0) + 1,
        status: FluxoVersaoStatus.RASCUNHO,
        gatilhoTipo: dados.gatilhoTipo,
        condicoes: dados.condicoes as unknown as Prisma.InputJsonValue,
        acoes: dados.acoes as unknown as Prisma.InputJsonValue,
        autor: dados.autor,
      },
    });
  }

  /** Promove o rascunho a `PUBLICADA`, arquivando a publicada anterior (se houver). Transacional. */
  async publicar(fluxoId: string, publicadoPor: string | null): Promise<FluxoVersaoRow> {
    return this.prisma.$transaction(async (tx) => {
      const rascunho = await tx.fluxoAutomacaoVersao.findFirst({
        where: { fluxoId, status: FluxoVersaoStatus.RASCUNHO },
      });
      if (!rascunho) throw new Error('sem rascunho para publicar');

      const publicadaAnterior = await tx.fluxoAutomacaoVersao.findFirst({
        where: { fluxoId, status: FluxoVersaoStatus.PUBLICADA },
      });
      const agora = agoraUtc();
      if (publicadaAnterior) {
        await tx.fluxoAutomacaoVersao.update({
          where: { id: publicadaAnterior.id },
          data: {
            status: FluxoVersaoStatus.ARQUIVADA,
            arquivadoPor: 'sistema:substituida',
            arquivadoEm: agora,
          },
        });
      }
      return tx.fluxoAutomacaoVersao.update({
        where: { id: rascunho.id },
        data: {
          status: FluxoVersaoStatus.PUBLICADA,
          publicadoPor,
          publicadoEm: agora,
        },
      });
    });
  }

  async arquivar(fluxoId: string, arquivadoPor: string | null): Promise<FluxoVersaoRow> {
    const publicada = await this.publicadaAtual(fluxoId);
    if (!publicada) throw new Error('sem versão publicada para arquivar');
    return this.prisma.fluxoAutomacaoVersao.update({
      where: { id: publicada.id },
      data: { status: FluxoVersaoStatus.ARQUIVADA, arquivadoPor, arquivadoEm: agoraUtc() },
    });
  }

  /** Versões `PUBLICADA` cujo gatilho bate com `fonte` — usado pelo worker (T019). */
  fluxosPublicadosPorGatilho(gatilhoTipo: FluxoGatilhoTipo): Promise<FluxoVersaoRow[]> {
    return this.prisma.fluxoAutomacaoVersao.findMany({
      where: { gatilhoTipo, status: FluxoVersaoStatus.PUBLICADA },
    });
  }
}
