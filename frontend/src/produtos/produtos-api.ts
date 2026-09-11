import { apiFetch } from '../auth/api-client';

export interface ProdutoResumo {
  id: string;
  codigo: string;
  nome: string | null;
  assinatura: boolean | null;
  nomeCurado: string | null;
  nomeDerivado: string | null;
  assinaturaCurada: boolean | null;
  assinaturaDerivada: boolean | null;
  camposEditados: string[];
  criadoEm: string;
  atualizadoEm: string;
}

export interface ProdutoLista {
  itens: ProdutoResumo[];
  pagina: number;
  tamanho: number;
  total: number;
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export interface ListarProdutosParams {
  q?: string;
  pagina?: number;
}

export interface CurarProdutoDto {
  nome?: string;
  assinatura?: boolean;
}

export const produtosApi = {
  async listar(p: ListarProdutosParams): Promise<ProdutoLista> {
    const qs = new URLSearchParams();
    if (p.q) qs.set('q', p.q);
    if (p.pagina) qs.set('pagina', String(p.pagina));
    return json<ProdutoLista>(await apiFetch(`/produtos?${qs.toString()}`));
  },
  async buscar(codigo: string): Promise<ProdutoResumo> {
    return json<ProdutoResumo>(await apiFetch(`/produtos/${codigo}`));
  },
  async curar(codigo: string, dto: CurarProdutoDto): Promise<ProdutoResumo> {
    return json<ProdutoResumo>(
      await apiFetch(`/produtos/${codigo}`, {
        method: 'PUT',
        body: JSON.stringify(dto),
      }),
    );
  },
};
