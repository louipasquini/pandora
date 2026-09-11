import { Injectable, NotFoundException } from '@nestjs/common';
import { projetarProduto, type ProdutoProjetado } from '../domain';
import { ProdutoRepository, type ListarProdutosFiltro } from '../infra/produto.repository';
import { CatalogoAuditService } from './catalogo-audit.service';

export interface CurarProdutoDto {
  nome?: string;
  assinatura?: boolean;
}

@Injectable()
export class ProdutoService {
  constructor(
    private readonly repo: ProdutoRepository,
    private readonly audit: CatalogoAuditService,
  ) {}

  async buscarPorCodigo(codigo: string): Promise<ProdutoProjetado> {
    const p = await this.repo.buscarPorCodigo(codigo);
    if (!p) throw new NotFoundException(`produto ${codigo} não encontrado`);
    return projetarProduto(p);
  }

  async listar(
    filtro: ListarProdutosFiltro,
  ): Promise<{ itens: ProdutoProjetado[]; total: number; pagina: number; tamanho: number }> {
    const { itens, total } = await this.repo.listar(filtro);
    return { itens: itens.map(projetarProduto), total, pagina: filtro.pagina, tamanho: filtro.tamanho };
  }

  /** `PUT /produtos/:codigo` — upsert de curadoria (FR-009). */
  async curar(codigo: string, dto: CurarProdutoDto, autor: string): Promise<ProdutoProjetado> {
    const { produto, alteracoes } = await this.repo.curar(codigo, dto);
    for (const a of alteracoes) {
      await this.audit.registrar({
        autor,
        entidade: 'produto',
        entidadeId: produto.id,
        campo: a.campo,
        valorAnterior: a.anterior,
        valorNovo: a.novo,
        motivo: 'curadoria manual',
      });
    }
    return projetarProduto(produto);
  }
}
