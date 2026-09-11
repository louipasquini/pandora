import { Injectable } from '@nestjs/common';
import { Classificacao, PlataformaOrigem, Prisma } from '@prisma/client';
import { EntidadeId, agoraUtc } from '../../core/core.module';
import { PrismaService } from '../../prisma/prisma.service';

const CONTAS_ASAAS: readonly PlataformaOrigem[] = [
  PlataformaOrigem.ASAAS_PRD,
  PlataformaOrigem.ASAAS_SVC,
];

export interface TransacaoParaVinculo {
  id: string;
  plataformaOrigem: PlataformaOrigem;
  idOrigem: string;
  classificacao: Classificacao;
  referenciaExternaIdOrigem: string | null;
  transacaoVinculadaId: string | null;
}

export interface VinculoResolvido {
  vinculoId: string;
  transacaoGuruId: string;
  transacaoAsaasId: string;
  origemRef: string;
  resolvidoEm: Date;
}

/**
 * Acesso a dados do vínculo Asaas↔Guru (spec 024). Só esta classe escreve em
 * `vinculo_transacao` / reclassifica uma transação para `COBRANCA_TERCEIRIZADA` —
 * usada tanto pelo executor da etapa 4 quanto pelos 2 endpoints de retry manual
 * (`TentarVincularService`), nunca uma 2ª via de escrita (Princípio VIII).
 */
@Injectable()
export class VinculoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async buscarPorId(id: string): Promise<TransacaoParaVinculo | null> {
    return this.prisma.transacao.findUnique({
      where: { id },
      select: {
        id: true,
        plataformaOrigem: true,
        idOrigem: true,
        classificacao: true,
        referenciaExternaIdOrigem: true,
        transacaoVinculadaId: true,
      },
    });
  }

  /** Transação na conta `plataforma` com essa chave natural — ou `null`. */
  async buscarPorChaveNatural(
    plataforma: PlataformaOrigem,
    idOrigem: string,
  ): Promise<{ id: string } | null> {
    return this.prisma.transacao.findUnique({
      where: { transacao_chave_natural: { plataformaOrigem: plataforma, idOrigem } },
      select: { id: true },
    });
  }

  /**
   * Transações Asaas pendentes (`referenciaExternaIdOrigem` presente, ainda sem
   * `transacaoVinculadaId`) na conta `plataformaAsaas` que apontam para
   * `idOrigemGuru` — usado no ramo Guru da etapa 4 (D-03) e no retry manual.
   */
  async buscarAsaasPendentesPorReferencia(
    plataformaAsaas: PlataformaOrigem,
    idOrigemGuru: string,
  ): Promise<TransacaoParaVinculo[]> {
    return this.prisma.transacao.findMany({
      where: {
        plataformaOrigem: plataformaAsaas,
        referenciaExternaIdOrigem: idOrigemGuru,
        transacaoVinculadaId: null,
      },
      select: {
        id: true,
        plataformaOrigem: true,
        idOrigem: true,
        classificacao: true,
        referenciaExternaIdOrigem: true,
        transacaoVinculadaId: true,
      },
    });
  }

  /** Todas as transações Asaas pendentes de vínculo, em qualquer conta. */
  async buscarTodasPendentes(): Promise<TransacaoParaVinculo[]> {
    return this.prisma.transacao.findMany({
      where: {
        plataformaOrigem: { in: CONTAS_ASAAS as PlataformaOrigem[] },
        referenciaExternaIdOrigem: { not: null },
        transacaoVinculadaId: null,
      },
      select: {
        id: true,
        plataformaOrigem: true,
        idOrigem: true,
        classificacao: true,
        referenciaExternaIdOrigem: true,
        transacaoVinculadaId: true,
      },
    });
  }

  /** Vínculo já existente para essa transação Guru (em qualquer Asaas), se houver. */
  async buscarVinculoPorGuru(transacaoGuruId: string): Promise<VinculoResolvido | null> {
    const v = await this.prisma.vinculoTransacao.findUnique({
      where: { transacaoGuruId },
    });
    if (!v) return null;
    return {
      vinculoId: v.id,
      transacaoGuruId: v.transacaoGuruId,
      transacaoAsaasId: v.transacaoAsaasId,
      origemRef: v.origemRef,
      resolvidoEm: v.resolvidoEm,
    };
  }

  /** Nunca sobrescreve um `motivoRevisao` já gravado por outra etapa — acumula
   *  (mesmo padrão de `ResolverOfertaEtapaService`/023). */
  async marcarRevisaoPorConflito(transacaoAsaasId: string, motivo: string): Promise<void> {
    const atual = await this.prisma.transacao.findUnique({
      where: { id: transacaoAsaasId },
      select: { motivoRevisao: true },
    });
    const existente = atual?.motivoRevisao ?? null;
    const jaContem = existente?.includes(motivo) === true;
    const motivoFinal = [existente, jaContem ? null : motivo].filter(Boolean).join('; ');
    await this.prisma.transacao.update({
      where: { id: transacaoAsaasId },
      data: { precisaRevisao: true, motivoRevisao: motivoFinal || null },
    });
  }

  async buscarVinculoDaTransacao(transacaoId: string): Promise<VinculoResolvido | null> {
    const v = await this.prisma.vinculoTransacao.findFirst({
      where: { OR: [{ transacaoGuruId: transacaoId }, { transacaoAsaasId: transacaoId }] },
    });
    if (!v) return null;
    return {
      vinculoId: v.id,
      transacaoGuruId: v.transacaoGuruId,
      transacaoAsaasId: v.transacaoAsaasId,
      origemRef: v.origemRef,
      resolvidoEm: v.resolvidoEm,
    };
  }

  /**
   * Crava o vínculo — atômico: `INSERT vinculo_transacao` + `UPDATE` da transação
   * Asaas (`transacaoVinculadaId` + `classificacao = COBRANCA_TERCEIRIZADA`).
   * Idempotente: se `transacaoAsaasId` já tem vínculo, devolve o existente sem
   * criar um 2º nem tocar a transação de novo (Princípio VII — nunca revertido).
   */
  async criarVinculo(
    transacaoGuruId: string,
    transacaoAsaasId: string,
    origemRef: string,
  ): Promise<VinculoResolvido> {
    const existente = await this.prisma.vinculoTransacao.findUnique({
      where: { transacaoAsaasId },
    });
    if (existente) {
      return {
        vinculoId: existente.id,
        transacaoGuruId: existente.transacaoGuruId,
        transacaoAsaasId: existente.transacaoAsaasId,
        origemRef: existente.origemRef,
        resolvidoEm: existente.resolvidoEm,
      };
    }

    const resolvidoEm = agoraUtc();
    try {
      const criado = await this.prisma.$transaction(async (tx) => {
        const vinculo = await tx.vinculoTransacao.create({
          data: {
            id: EntidadeId.novo().value,
            transacaoGuruId,
            transacaoAsaasId,
            origemRef,
            resolvidoEm,
          },
        });
        await tx.transacao.update({
          where: { id: transacaoAsaasId },
          data: {
            transacaoVinculadaId: transacaoGuruId,
            classificacao: Classificacao.COBRANCA_TERCEIRIZADA,
          },
        });
        return vinculo;
      });

      return {
        vinculoId: criado.id,
        transacaoGuruId: criado.transacaoGuruId,
        transacaoAsaasId: criado.transacaoAsaasId,
        origemRef: criado.origemRef,
        resolvidoEm: criado.resolvidoEm,
      };
    } catch (err) {
      // corrida com outra tentativa de vincular a mesma transação (mesmo padrão
      // de `transacao.repository.ts`/018) — recarrega o vínculo já criado.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const jaExiste = await this.prisma.vinculoTransacao.findUnique({
          where: { transacaoAsaasId },
        });
        if (jaExiste) {
          return {
            vinculoId: jaExiste.id,
            transacaoGuruId: jaExiste.transacaoGuruId,
            transacaoAsaasId: jaExiste.transacaoAsaasId,
            origemRef: jaExiste.origemRef,
            resolvidoEm: jaExiste.resolvidoEm,
          };
        }
      }
      throw err;
    }
  }
}
