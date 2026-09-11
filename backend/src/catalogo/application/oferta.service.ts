import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Dinheiro } from '../../core/core.module';
import { projetarOferta, type TurmaTipo } from '../domain';
import {
  OfertaRepository,
  type DadosCriarOfertaManual,
  type ListarOfertasFiltro,
  type OfertaComRelacoes,
} from '../infra/oferta.repository';
import { ProdutoRepository } from '../infra/produto.repository';
import { CatalogoAuditService } from './catalogo-audit.service';

function par(int: bigint | null, moeda: string | null): { valorInt: string; moeda: string } | null {
  if (int == null || moeda == null) return null;
  return { valorInt: int.toString(), moeda: moeda.trim() };
}

export interface DinheiroEntrada {
  valorInt: string | number;
  moeda: string;
}

export interface CriarOfertaDto {
  produtoId: string;
  turmaTipo?: TurmaTipo;
  turmaNumero?: number | null;
  subprodutoCodigo?: string;
  modeloCobrancaCodigo?: string;
  modeloTransacaoCodigo?: string;
  origemRef?: { plataformaOrigem: string; tipoRef: 'TAG' | 'HOTMART_PRICE_CODE'; valorRef: string };
}

export interface CurarOfertaDto {
  turmaTipo?: TurmaTipo;
  turmaNumero?: number | null;
  subprodutoCodigo?: string;
  modeloCobrancaCodigo?: string;
  modeloTransacaoCodigo?: string;
  catalogo?: {
    ticket?: DinheiroEntrada | null;
    precoTabela?: DinheiroEntrada | null;
    tempoAcessoDias?: number | null;
    combo?: boolean;
    lancamento?: boolean;
    bonus?: string[];
    produtosDoComboIds?: string[];
  };
}

function dinheiroDe(e: DinheiroEntrada | null | undefined): { valorInt: bigint; moeda: string } | null | undefined {
  if (e === undefined) return undefined;
  if (e === null) return null;
  const d = Dinheiro.deInteiroEscalado(
    typeof e.valorInt === 'string' ? BigInt(e.valorInt) : e.valorInt,
    e.moeda,
  );
  return { valorInt: d.valorInt, moeda: d.moeda };
}

function projetarResposta(o: OfertaComRelacoes) {
  return {
    ...projetarOferta(o),
    produto: o.produto,
    origensRef: o.origensRef,
    catalogo: o.catalogo
      ? {
          ticket: par(o.catalogo.ticketInt, o.catalogo.ticketMoeda),
          precoTabela: par(o.catalogo.precoTabelaInt, o.catalogo.precoTabelaMoeda),
          tempoAcessoDias: o.catalogo.tempoAcessoDias,
          combo: o.catalogo.combo,
          lancamento: o.catalogo.lancamento,
          bonus: o.catalogo.bonus
            .slice()
            .sort((a, b) => a.ordem - b.ordem)
            .map((b) => b.descricao),
          produtosDoComboIds: o.catalogo.combos.map((c) => c.produtoId),
        }
      : null,
  };
}

export type OfertaResposta = ReturnType<typeof projetarResposta>;

@Injectable()
export class OfertaService {
  constructor(
    private readonly repo: OfertaRepository,
    private readonly produtos: ProdutoRepository,
    private readonly audit: CatalogoAuditService,
  ) {}

  async buscarPorId(id: string): Promise<OfertaResposta> {
    const o = await this.repo.buscarPorId(id);
    if (!o) throw new NotFoundException(`oferta ${id} não encontrada`);
    return projetarResposta(o);
  }

  async listar(
    filtro: ListarOfertasFiltro,
  ): Promise<{ itens: OfertaResposta[]; total: number; pagina: number; tamanho: number }> {
    const { itens, total } = await this.repo.listar(filtro);
    return {
      itens: itens.map(projetarResposta),
      total,
      pagina: filtro.pagina,
      tamanho: filtro.tamanho,
    };
  }

  /** `POST /ofertas` — criação manual (D-13). */
  async criar(dto: CriarOfertaDto): Promise<OfertaResposta> {
    const produto = await this.produtos.buscarPorId(dto.produtoId);
    if (!produto) throw new NotFoundException(`produto ${dto.produtoId} não encontrado`);

    const dados: DadosCriarOfertaManual = {
      produtoId: dto.produtoId,
      turmaTipo: dto.turmaTipo,
      turmaNumero: dto.turmaNumero,
      subprodutoCodigo: dto.subprodutoCodigo,
      modeloCobrancaCodigo: dto.modeloCobrancaCodigo,
      modeloTransacaoCodigo: dto.modeloTransacaoCodigo,
      origemRef: dto.origemRef,
    };
    const oferta = await this.repo.criarManual(dados).catch((e) => {
      throw mapearErroPrisma(e);
    });
    return this.buscarPorId(oferta.id);
  }

  /** `PATCH /ofertas/:id` — curadoria (inclui `oferta_catalogo`, D-11 do contrato). */
  async curar(id: string, dto: CurarOfertaDto, autor: string): Promise<OfertaResposta> {
    const existente = await this.repo.buscarPorId(id);
    if (!existente) throw new NotFoundException(`oferta ${id} não encontrada`);

    const { alteracoes } = await this.repo.curar(id, {
      turmaTipo: dto.turmaTipo,
      turmaNumero: dto.turmaNumero,
      subprodutoCodigo: dto.subprodutoCodigo,
      modeloCobrancaCodigo: dto.modeloCobrancaCodigo,
      modeloTransacaoCodigo: dto.modeloTransacaoCodigo,
    });
    for (const a of alteracoes) {
      await this.audit.registrar({
        autor,
        entidade: 'oferta',
        entidadeId: id,
        campo: a.campo,
        valorAnterior: a.anterior,
        valorNovo: a.novo,
        motivo: 'curadoria manual',
      });
    }

    if (dto.catalogo) {
      const c = dto.catalogo;
      await this.repo
        .atualizarCatalogo(id, {
          ticket: dinheiroDe(c.ticket),
          precoTabela: dinheiroDe(c.precoTabela),
          tempoAcessoDias: c.tempoAcessoDias,
          combo: c.combo,
          lancamento: c.lancamento,
          bonus: c.bonus,
          produtosDoComboIds: c.produtosDoComboIds,
        })
        .catch((e) => {
          throw mapearErroPrisma(e);
        });
      await this.audit.registrar({
        autor,
        entidade: 'oferta_catalogo',
        entidadeId: id,
        campo: 'catalogo',
        valorAnterior: null,
        valorNovo: c,
        motivo: 'curadoria manual',
      });
    }

    return this.buscarPorId(id);
  }
}

/** Traduz violação de constraint do Postgres/Prisma pra um erro HTTP com sentido de negócio. */
function mapearErroPrisma(e: unknown): Error {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2002') return new ConflictException('já existe uma oferta com essa referência de origem');
    if (e.code === 'P2003' || e.code === 'P2025') {
      return new BadRequestException('referência inválida (produto do combo ou origem inexistente)');
    }
  }
  return e as Error;
}
