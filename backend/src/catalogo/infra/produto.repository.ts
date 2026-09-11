import { Injectable } from '@nestjs/common';
import { EntidadeId } from '../../core/core.module';
import { PrismaService } from '../../prisma/prisma.service';
import { marcarEditado, type ProdutoLinha } from '../domain';

export interface AlteracaoCampo {
  campo: string;
  anterior: unknown;
  novo: unknown;
}

export interface ListarProdutosFiltro {
  q?: string;
  pagina: number;
  tamanho: number;
}

@Injectable()
export class ProdutoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async buscarPorCodigo(codigo: string): Promise<ProdutoLinha | null> {
    return this.prisma.produto.findUnique({ where: { codigo: codigo.toUpperCase() } });
  }

  async buscarPorId(id: string): Promise<ProdutoLinha | null> {
    return this.prisma.produto.findUnique({ where: { id } });
  }

  /** Cria com campos derivados/curados nulos — 1ª venda com um código novo (D-05). */
  async criar(codigo: string): Promise<ProdutoLinha> {
    return this.prisma.produto.create({
      data: { id: EntidadeId.novo().value, codigo: codigo.toUpperCase() },
    });
  }

  /** Idempotente — nunca cria 2 produtos para o mesmo código (`@@unique`). */
  async buscarOuCriarPorCodigo(
    codigo: string,
  ): Promise<{ produto: ProdutoLinha; criado: boolean }> {
    const existente = await this.buscarPorCodigo(codigo);
    if (existente) return { produto: existente, criado: false };
    try {
      return { produto: await this.criar(codigo), criado: true };
    } catch {
      // corrida entre 2 chamadas concorrentes pro mesmo código novo — a 2ª bate
      // no `@@unique`; relê a linha que a 1ª acabou de criar.
      const linha = await this.buscarPorCodigo(codigo);
      if (!linha) throw new Error(`produto ${codigo}: falha ao criar ou reler`);
      return { produto: linha, criado: false };
    }
  }

  /**
   * Aplica um valor **derivado** só se o campo não estiver travado por
   * curadoria manual (`aplicarSeNaoEditado`, D-07). Usado pelo import de CSV
   * (nunca pela ingestão de transação — produto não tem campo derivado de
   * venda, só de catálogo).
   */
  async aplicarDerivado(
    produtoId: string,
    dados: { nome?: string; assinatura?: boolean },
  ): Promise<void> {
    const atual = await this.prisma.produto.findUniqueOrThrow({ where: { id: produtoId } });
    const patch: Record<string, unknown> = {};
    if (dados.nome !== undefined && !atual.camposEditados.includes('nome')) {
      patch.nomeDerivado = dados.nome;
    }
    if (dados.assinatura !== undefined && !atual.camposEditados.includes('assinatura')) {
      patch.assinaturaDerivada = dados.assinatura;
    }
    if (Object.keys(patch).length === 0) return;
    await this.prisma.produto.update({ where: { id: produtoId }, data: patch });
  }

  /**
   * Curadoria manual (`PUT /produtos/:codigo`) — upsert (FR-009). Marca
   * `camposEditados` para cada campo enviado e devolve as alterações de fato
   * (para o audit registrar só o delta real).
   */
  async curar(
    codigo: string,
    dto: { nome?: string; assinatura?: boolean },
  ): Promise<{ produto: ProdutoLinha; alteracoes: AlteracaoCampo[] }> {
    const cod = codigo.toUpperCase();
    const atual = await this.prisma.produto.findUnique({ where: { codigo: cod } });

    const alteracoes: AlteracaoCampo[] = [];
    const patch: Record<string, unknown> = {};
    let camposEditados = atual?.camposEditados ?? [];

    if (dto.nome !== undefined && dto.nome !== (atual?.nomeCurado ?? null)) {
      alteracoes.push({ campo: 'nome', anterior: atual?.nomeCurado ?? null, novo: dto.nome });
      patch.nomeCurado = dto.nome;
      camposEditados = marcarEditado(camposEditados, 'nome');
    }
    if (
      dto.assinatura !== undefined &&
      dto.assinatura !== (atual?.assinaturaCurada ?? null)
    ) {
      alteracoes.push({
        campo: 'assinatura',
        anterior: atual?.assinaturaCurada ?? null,
        novo: dto.assinatura,
      });
      patch.assinaturaCurada = dto.assinatura;
      camposEditados = marcarEditado(camposEditados, 'assinatura');
    }
    if (alteracoes.length > 0) patch.camposEditados = camposEditados;

    const produto = atual
      ? Object.keys(patch).length > 0
        ? await this.prisma.produto.update({ where: { codigo: cod }, data: patch })
        : atual
      : await this.prisma.produto.create({
          data: { id: EntidadeId.novo().value, codigo: cod, ...patch },
        });

    return { produto, alteracoes };
  }

  async listar(
    filtro: ListarProdutosFiltro,
  ): Promise<{ itens: ProdutoLinha[]; total: number }> {
    const where = filtro.q
      ? {
          OR: [
            { codigo: { contains: filtro.q.toUpperCase() } },
            { nomeCurado: { contains: filtro.q, mode: 'insensitive' as const } },
            { nomeDerivado: { contains: filtro.q, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const [itens, total] = await this.prisma.$transaction([
      this.prisma.produto.findMany({
        where,
        orderBy: { codigo: 'asc' },
        skip: (filtro.pagina - 1) * filtro.tamanho,
        take: filtro.tamanho,
      }),
      this.prisma.produto.count({ where }),
    ]);
    return { itens, total };
  }
}
