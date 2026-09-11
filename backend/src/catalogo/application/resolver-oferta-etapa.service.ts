import { Injectable } from '@nestjs/common';
import type {
  EntradaEtapaExterna,
  ExecutorEtapaExterno,
  SaidaEtapaExterna,
} from '../../core/core.module';
import { PrismaService } from '../../prisma/prisma.service';
import { decodificarTag, estrategiaDe, localizarTag } from '../domain';
import { OfertaRepository } from '../infra/oferta.repository';
import { ProdutoRepository } from '../infra/produto.repository';

/**
 * Etapa 5 do pipeline canônico (visão 5.3) — `RESOLVER_OFERTA` (spec 023).
 * `ExecutorEtapaExterno` do `core` (contrato já existente desde a 018) —
 * **nenhuma mudança em `WorkerService`/`etapas.ts`**.
 *
 * Lê só `entrada.canonico`/`entrada.plataformaOrigem`/`entrada.resultados`
 * (nenhuma consulta a `transacao` além do `UPDATE` final — R2/contracts). Grava
 * o resultado em `transacao.oferta_id` diretamente via `PrismaService` — a
 * coluna já pertence ao schema de `transacao` desde a 018 (Complexity Tracking
 * do plan.md justifica por que isso não inverte a fronteira de contexto).
 */
@Injectable()
export class ResolverOfertaEtapaService implements ExecutorEtapaExterno {
  readonly etapa = 'RESOLVER_OFERTA';

  constructor(
    private readonly prisma: PrismaService,
    private readonly produtos: ProdutoRepository,
    private readonly ofertas: OfertaRepository,
  ) {}

  async executar(entrada: EntradaEtapaExterna): Promise<SaidaEtapaExterna> {
    const transacaoId = (
      entrada.resultados.UPSERT_TRANSACAO as { transacaoId?: string } | undefined
    )?.transacaoId;
    if (!transacaoId) {
      return {
        status: 'erro',
        erroDetalhe: 'RESOLVER_OFERTA: transacaoId ausente em resultados.UPSERT_TRANSACAO',
      };
    }

    const codigoOrigem = entrada.canonico?.oferta?.codigoOrigem ?? undefined;
    const nomeOrigem = entrada.canonico?.oferta?.nomeOrigem ?? undefined;
    const { ofertaId, criada, motivoRevisao } = await this.resolver(
      entrada.plataformaOrigem,
      codigoOrigem,
      nomeOrigem,
    );

    await this.gravarNaTransacao(transacaoId, ofertaId, motivoRevisao);

    return {
      status: 'ok',
      resultado: { ofertaId, criada, motivoRevisao: motivoRevisao ?? null },
      revisar: motivoRevisao !== undefined,
    };
  }

  private async resolver(
    plataformaOrigem: string,
    codigoOrigem: string | undefined,
    nomeOrigem: string | undefined,
  ): Promise<{ ofertaId: string | null; criada: boolean; motivoRevisao?: string }> {
    const estrategia = estrategiaDe(plataformaOrigem);

    if (estrategia === 'CATALOGO_HOTMART') {
      if (!codigoOrigem) {
        return {
          ofertaId: null,
          criada: false,
          motivoRevisao: 'venda Hotmart sem price_code (código de oferta de origem ausente)',
        };
      }
      const existente = await this.ofertas.buscarPorOrigemRef(
        plataformaOrigem,
        'HOTMART_PRICE_CODE',
        codigoOrigem,
      );
      if (existente) return { ofertaId: existente.id, criada: false };
      return {
        ofertaId: null,
        criada: false,
        motivoRevisao: `price_code não catalogado: ${codigoOrigem} — importe o catálogo Hotmart antes`,
      };
    }

    // estratégia TAG (D-02/D-03)
    const tag = localizarTag({ codigoOrigem, nomeOrigem });
    if (!tag) {
      return { ofertaId: null, criada: false, motivoRevisao: 'tag de oferta não localizada' };
    }

    const existente = await this.ofertas.buscarPorOrigemRef(plataformaOrigem, 'TAG', tag);
    if (existente) return { ofertaId: existente.id, criada: false };

    const decodificada = decodificarTag(tag);
    if (!decodificada) {
      return {
        ofertaId: null,
        criada: false,
        motivoRevisao: `tag localizada mas em formato inválido: ${tag}`,
      };
    }

    const { produto } = await this.produtos.buscarOuCriarPorCodigo(decodificada.codigoProduto);
    const { oferta, criada } = await this.ofertas.criarComOrigemRef({
      produtoId: produto.id,
      plataformaOrigem,
      tipoRef: 'TAG',
      valorRef: tag,
      turmaTipo: decodificada.turma.tipo,
      turmaNumero: decodificada.turma.numero,
      subprodutoCodigo: decodificada.subprodutoCodigo,
      modeloCobrancaCodigo: decodificada.modeloCobrancaCodigo,
      modeloTransacaoCodigo: decodificada.modeloTransacaoCodigo,
    });
    return { ofertaId: oferta.id, criada };
  }

  /** Nunca sobrescreve um `motivoRevisao` já gravado (por outra etapa) — acumula. */
  private async gravarNaTransacao(
    transacaoId: string,
    ofertaId: string | null,
    motivoNovo: string | undefined,
  ): Promise<void> {
    const atual = await this.prisma.transacao.findUnique({
      where: { id: transacaoId },
      select: { motivoRevisao: true, precisaRevisao: true },
    });

    const motivoExistente = atual?.motivoRevisao ?? null;
    const jaContemMotivo = motivoNovo != null && motivoExistente?.includes(motivoNovo) === true;
    const motivos = [motivoExistente, jaContemMotivo ? null : motivoNovo].filter(
      (m): m is string => !!m,
    );
    const motivoFinal = motivos.length > 0 ? motivos.join('; ') : null;

    await this.prisma.transacao.update({
      where: { id: transacaoId },
      data: {
        ofertaId,
        precisaRevisao: (atual?.precisaRevisao ?? false) || motivoNovo !== undefined,
        motivoRevisao: motivoFinal,
      },
    });
  }
}
