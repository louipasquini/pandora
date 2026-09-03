import { apiFetch } from '../auth/api-client';

export interface ContaListaItem {
  id: string;
  nome: string;
  tipo: string;
  totalPessoas: number;
  unificada: boolean;
}
export interface ContaLista {
  itens: ContaListaItem[];
  pagina: number;
  tamanho: number;
  total: number;
}
export interface ContaDetalhe {
  id: string;
  nome: string;
  tipo: string;
  pessoas: { id: string; nome: string }[];
  merges: {
    id: string;
    papel: 'sobrevivente' | 'absorvida';
    absorvidaId: string;
    quando: string;
    estado: string;
    autor: string;
  }[];
  unificacao?: { deId: string; em: string; mergeId: string };
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export const contasApi = {
  async listar(params: { q?: string; pagina?: number }): Promise<ContaLista> {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.pagina) qs.set('pagina', String(params.pagina));
    const res = await apiFetch(`/contas?${qs.toString()}`);
    return json<ContaLista>(res);
  },
  async detalhe(id: string): Promise<ContaDetalhe> {
    const res = await apiFetch(`/contas/${id}`);
    return json<ContaDetalhe>(res);
  },
  async criar(body: { tipo: string; nome: string }): Promise<ContaDetalhe> {
    const res = await apiFetch('/contas', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return json<ContaDetalhe>(res);
  },
  async associar(contaId: string, pessoaId: string): Promise<ContaDetalhe> {
    const res = await apiFetch(`/contas/${contaId}/pessoas`, {
      method: 'POST',
      body: JSON.stringify({ pessoaId }),
    });
    return json<ContaDetalhe>(res);
  },
  async desassociar(contaId: string, pessoaId: string): Promise<void> {
    await apiFetch(`/contas/${contaId}/pessoas/${pessoaId}`, { method: 'DELETE' });
  },
  async merge(sobreviventeId: string, absorvidaId: string): Promise<ContaDetalhe> {
    const res = await apiFetch(`/contas/${sobreviventeId}/merge`, {
      method: 'POST',
      body: JSON.stringify({ absorvidaId }),
    });
    return json<ContaDetalhe>(res);
  },
  async desfazerMerge(sobreviventeId: string, mergeId: string): Promise<void> {
    await apiFetch(`/contas/${sobreviventeId}/merge/${mergeId}/desfazer`, {
      method: 'POST',
    });
  },
};
