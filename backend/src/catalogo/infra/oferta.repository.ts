import { Injectable } from '@nestjs/common';
import type { OfertaOrigemRefTipo, TurmaTipo as PrismaTurmaTipo } from '@prisma/client';
import { EntidadeId } from '../../core/core.module';
import { PrismaService } from '../../prisma/prisma.service';
import { marcarEditado, type OfertaLinha, type TurmaTipo } from '../domain';

export interface OfertaComRelacoes extends OfertaLinha {
  produto: { id: string; codigo: string };
  origensRef: { plataformaOrigem: string; tipoRef: string; valorRef: string }[];
  catalogo:
    | {
        id: string;
        ticketInt: bigint | null;
        ticketMoeda: string | null;
        precoTabelaInt: bigint | null;
        precoTabelaMoeda: string | null;
        tempoAcessoDias: number | null;
        combo: boolean;
        lancamento: boolean;
        bonus: { descricao: string; ordem: number }[];
        combos: { produtoId: string }[];
      }
    | null;
}

const INCLUDE_RELACOES = {
  produto: { select: { id: true, codigo: true } },
  origensRef: {
    select: { plataformaOrigem: true, tipoRef: true, valorRef: true },
  },
  catalogo: { include: { bonus: true, combos: true } },
} as const;

export interface DadosCriarOfertaDerivada {
  produtoId: string;
  plataformaOrigem: string;
  tipoRef: 'TAG' | 'HOTMART_PRICE_CODE';
  valorRef: string;
  turmaTipo?: TurmaTipo;
  turmaNumero?: number | null;
  subprodutoCodigo?: string;
  modeloCobrancaCodigo?: string;
  modeloTransacaoCodigo?: string;
}

export interface DadosCriarOfertaManual {
  produtoId: string;
  turmaTipo?: TurmaTipo;
  turmaNumero?: number | null;
  subprodutoCodigo?: string;
  modeloCobrancaCodigo?: string;
  modeloTransacaoCodigo?: string;
  origemRef?: { plataformaOrigem: string; tipoRef: 'TAG' | 'HOTMART_PRICE_CODE'; valorRef: string };
}

export interface DadosCurarOferta {
  turmaTipo?: TurmaTipo;
  turmaNumero?: number | null;
  subprodutoCodigo?: string;
  modeloCobrancaCodigo?: string;
  modeloTransacaoCodigo?: string;
}

export interface DadosCatalogoOferta {
  ticket?: { valorInt: bigint; moeda: string } | null;
  precoTabela?: { valorInt: bigint; moeda: string } | null;
  tempoAcessoDias?: number | null;
  combo?: boolean;
  lancamento?: boolean;
  bonus?: string[];
  produtosDoComboIds?: string[];
}

export interface ListarOfertasFiltro {
  produtoId?: string;
  produtoCodigo?: string;
  plataformaOrigem?: string;
  pagina: number;
  tamanho: number;
}

@Injectable()
export class OfertaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async buscarPorOrigemRef(
    plataformaOrigem: string,
    tipoRef: 'TAG' | 'HOTMART_PRICE_CODE',
    valorRef: string,
  ): Promise<OfertaLinha | null> {
    const ref = await this.prisma.ofertaOrigemRef.findUnique({
      where: {
        oferta_origem_ref_chave: {
          plataformaOrigem: plataformaOrigem as never,
          tipoRef: tipoRef as OfertaOrigemRefTipo,
          valorRef,
        },
      },
      include: { oferta: true },
    });
    return ref?.oferta ?? null;
  }

  async buscarPorId(id: string): Promise<OfertaComRelacoes | null> {
    return this.prisma.oferta.findUnique({
      where: { id },
      include: INCLUDE_RELACOES,
    }) as unknown as Promise<OfertaComRelacoes | null>;
  }

  /**
   * Cria `oferta` + `oferta_origem_ref` atomicamente, com os campos crus da
   * tag/catálogo como **derivados** (nunca curados — D-06). Idempotente: uma
   * corrida entre 2 chamadas concorrentes pra mesma `(plataforma, tipoRef,
   * valorRef)` bate no `@@unique` da 2ª, que relê a linha da 1ª.
   */
  async criarComOrigemRef(
    dados: DadosCriarOfertaDerivada,
  ): Promise<{ oferta: OfertaLinha; criada: boolean }> {
    try {
      const oferta = await this.prisma.$transaction(async (tx) => {
        const nova = await tx.oferta.create({
          data: {
            id: EntidadeId.novo().value,
            produtoId: dados.produtoId,
            turmaTipoDerivado: dados.turmaTipo as PrismaTurmaTipo | undefined,
            turmaNumeroDerivado: dados.turmaNumero ?? undefined,
            subprodutoCodigoDerivado: dados.subprodutoCodigo,
            modeloCobrancaCodigoDerivado: dados.modeloCobrancaCodigo,
            modeloTransacaoCodigoDerivado: dados.modeloTransacaoCodigo,
          },
        });
        await tx.ofertaOrigemRef.create({
          data: {
            id: EntidadeId.novo().value,
            ofertaId: nova.id,
            plataformaOrigem: dados.plataformaOrigem as never,
            tipoRef: dados.tipoRef as OfertaOrigemRefTipo,
            valorRef: dados.valorRef,
          },
        });
        return nova;
      });
      return { oferta, criada: true };
    } catch {
      const existente = await this.buscarPorOrigemRef(
        dados.plataformaOrigem,
        dados.tipoRef,
        dados.valorRef,
      );
      if (!existente) {
        throw new Error(
          `oferta (${dados.plataformaOrigem}/${dados.tipoRef}/${dados.valorRef}): falha ao criar ou reler`,
        );
      }
      return { oferta: existente, criada: false };
    }
  }

  /** Criação manual (`POST /ofertas`) — os campos enviados nascem **curados** (D-13). */
  async criarManual(dados: DadosCriarOfertaManual): Promise<OfertaLinha> {
    return this.prisma.$transaction(async (tx) => {
      const camposEditados: string[] = [];
      if (dados.turmaTipo !== undefined) camposEditados.push('turma');
      if (dados.subprodutoCodigo !== undefined) camposEditados.push('subproduto');
      if (dados.modeloCobrancaCodigo !== undefined) camposEditados.push('modeloCobranca');
      if (dados.modeloTransacaoCodigo !== undefined) camposEditados.push('modeloTransacao');

      const nova = await tx.oferta.create({
        data: {
          id: EntidadeId.novo().value,
          produtoId: dados.produtoId,
          turmaTipoCurado: dados.turmaTipo as PrismaTurmaTipo | undefined,
          turmaNumeroCurado: dados.turmaNumero ?? undefined,
          subprodutoCodigoCurado: dados.subprodutoCodigo,
          modeloCobrancaCodigoCurado: dados.modeloCobrancaCodigo,
          modeloTransacaoCodigoCurado: dados.modeloTransacaoCodigo,
          camposEditados,
        },
      });
      if (dados.origemRef) {
        await tx.ofertaOrigemRef.create({
          data: {
            id: EntidadeId.novo().value,
            ofertaId: nova.id,
            plataformaOrigem: dados.origemRef.plataformaOrigem as never,
            tipoRef: dados.origemRef.tipoRef as OfertaOrigemRefTipo,
            valorRef: dados.origemRef.valorRef,
          },
        });
      }
      return nova;
    });
  }

  /** Curadoria (`PATCH /ofertas/:id`) — marca `camposEditados` por campo enviado. */
  async curar(
    id: string,
    dto: DadosCurarOferta,
  ): Promise<{ oferta: OfertaLinha; alteracoes: { campo: string; anterior: unknown; novo: unknown }[] }> {
    const atual = await this.prisma.oferta.findUniqueOrThrow({ where: { id } });
    const alteracoes: { campo: string; anterior: unknown; novo: unknown }[] = [];
    const patch: Record<string, unknown> = {};
    let camposEditados = atual.camposEditados;

    const registrarCodigo = (campo: string, anterior: unknown, novo: unknown, chaveCurada: string) => {
      if (novo === undefined || novo === anterior) return;
      alteracoes.push({ campo, anterior, novo });
      patch[chaveCurada] = novo;
      camposEditados = marcarEditado(camposEditados, campo);
    };

    if (dto.turmaTipo !== undefined || dto.turmaNumero !== undefined) {
      const anterior = { tipo: atual.turmaTipoCurado, numero: atual.turmaNumeroCurado };
      const novoTipo = dto.turmaTipo ?? atual.turmaTipoCurado;
      const novoNumero = dto.turmaNumero ?? null;
      if (novoTipo !== anterior.tipo || novoNumero !== anterior.numero) {
        alteracoes.push({ campo: 'turma', anterior, novo: { tipo: novoTipo, numero: novoNumero } });
        patch.turmaTipoCurado = novoTipo;
        patch.turmaNumeroCurado = novoNumero;
        camposEditados = marcarEditado(camposEditados, 'turma');
      }
    }
    registrarCodigo(
      'subproduto',
      atual.subprodutoCodigoCurado,
      dto.subprodutoCodigo,
      'subprodutoCodigoCurado',
    );
    registrarCodigo(
      'modeloCobranca',
      atual.modeloCobrancaCodigoCurado,
      dto.modeloCobrancaCodigo,
      'modeloCobrancaCodigoCurado',
    );
    registrarCodigo(
      'modeloTransacao',
      atual.modeloTransacaoCodigoCurado,
      dto.modeloTransacaoCodigo,
      'modeloTransacaoCodigoCurado',
    );

    if (alteracoes.length === 0) return { oferta: atual, alteracoes: [] };
    patch.camposEditados = camposEditados;
    const oferta = await this.prisma.oferta.update({ where: { id }, data: patch });
    return { oferta, alteracoes };
  }

  /**
   * Upsert transacional de `oferta_catalogo` + substituição total de
   * bônus/combo (semântica de `PUT`, mesmo padrão da spec 008). 100% curado
   * (D-08) — sem par derivado.
   */
  async atualizarCatalogo(ofertaId: string, dados: DadosCatalogoOferta): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existente = await tx.ofertaCatalogo.findUnique({ where: { ofertaId } });
      const patch: Record<string, unknown> = {};
      if (dados.ticket !== undefined) {
        patch.ticketInt = dados.ticket?.valorInt ?? null;
        patch.ticketMoeda = dados.ticket?.moeda ?? null;
      }
      if (dados.precoTabela !== undefined) {
        patch.precoTabelaInt = dados.precoTabela?.valorInt ?? null;
        patch.precoTabelaMoeda = dados.precoTabela?.moeda ?? null;
      }
      if (dados.tempoAcessoDias !== undefined) patch.tempoAcessoDias = dados.tempoAcessoDias;
      if (dados.combo !== undefined) patch.combo = dados.combo;
      if (dados.lancamento !== undefined) patch.lancamento = dados.lancamento;

      const catalogo = existente
        ? await tx.ofertaCatalogo.update({ where: { ofertaId }, data: patch })
        : await tx.ofertaCatalogo.create({
            data: { id: EntidadeId.novo().value, ofertaId, ...patch },
          });

      if (dados.bonus !== undefined) {
        await tx.ofertaCatalogoBonus.deleteMany({ where: { ofertaCatalogoId: catalogo.id } });
        if (dados.bonus.length > 0) {
          await tx.ofertaCatalogoBonus.createMany({
            data: dados.bonus.map((descricao, ordem) => ({
              id: EntidadeId.novo().value,
              ofertaCatalogoId: catalogo.id,
              descricao,
              ordem,
            })),
          });
        }
      }

      if (dados.produtosDoComboIds !== undefined) {
        await tx.ofertaCatalogoComboItem.deleteMany({ where: { ofertaCatalogoId: catalogo.id } });
        if (dados.produtosDoComboIds.length > 0) {
          await tx.ofertaCatalogoComboItem.createMany({
            data: dados.produtosDoComboIds.map((produtoId) => ({
              id: EntidadeId.novo().value,
              ofertaCatalogoId: catalogo.id,
              produtoId,
            })),
          });
        }
      }
    });
  }

  /** Cria a ref se ela ainda não existir para outra oferta (informativo — import de CSV). */
  async criarOrigemRefSeAusente(
    ofertaId: string,
    plataformaOrigem: string,
    tipoRef: 'TAG' | 'HOTMART_PRICE_CODE',
    valorRef: string,
  ): Promise<void> {
    const existente = await this.buscarPorOrigemRef(plataformaOrigem, tipoRef, valorRef);
    if (existente) return;
    await this.prisma.ofertaOrigemRef.create({
      data: {
        id: EntidadeId.novo().value,
        ofertaId,
        plataformaOrigem: plataformaOrigem as never,
        tipoRef: tipoRef as OfertaOrigemRefTipo,
        valorRef,
      },
    });
  }

  async listar(
    filtro: ListarOfertasFiltro,
  ): Promise<{ itens: OfertaComRelacoes[]; total: number }> {
    const where = {
      ...(filtro.produtoId ? { produtoId: filtro.produtoId } : {}),
      ...(filtro.produtoCodigo ? { produto: { codigo: filtro.produtoCodigo.toUpperCase() } } : {}),
      ...(filtro.plataformaOrigem
        ? { origensRef: { some: { plataformaOrigem: filtro.plataformaOrigem as never } } }
        : {}),
    };
    const [itens, total] = await this.prisma.$transaction([
      this.prisma.oferta.findMany({
        where,
        include: INCLUDE_RELACOES,
        orderBy: { criadoEm: 'desc' },
        skip: (filtro.pagina - 1) * filtro.tamanho,
        take: filtro.tamanho,
      }),
      this.prisma.oferta.count({ where }),
    ]);
    return { itens: itens as unknown as OfertaComRelacoes[], total };
  }
}
