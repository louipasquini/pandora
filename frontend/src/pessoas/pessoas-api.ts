import { apiFetch } from '../auth/api-client';

export interface Contato {
  valor: string;
  primario: boolean;
  curado: boolean;
  rebaixadoEm: string | null;
}
export interface PessoaListaItem {
  id: string;
  nome: string;
  tipo: string;
  emailPrimario: string | null;
  telefonePrimario: string | null;
  documentos: string[];
  contaId: string | null;
  unificada: boolean;
}
export interface PessoaLista {
  itens: PessoaListaItem[];
  pagina: number;
  tamanho: number;
  total: number;
}
export interface MergeInfo {
  id: string;
  papel: 'sobrevivente' | 'absorvida';
  absorvidaId: string;
  sobreviventeId: string;
  quando: string;
  estado: string;
  autor: string;
}
export interface PessoaDetalhe {
  id: string;
  nome: string;
  tipo: string;
  pseudonimizadaEm: string | null;
  conta: { id: string; nome: string; tipo: string } | null;
  emails: Contato[];
  telefones: Contato[];
  documentos: { tipo: string; valor: string; curado: boolean }[];
  enderecos: Record<string, unknown>[];
  origemRefs: { plataformaOrigem: string; tipoRef: string; valorRef: string }[];
  merges: MergeInfo[];
  unificacao?: { deId: string; em: string; mergeId: string };
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export const pessoasApi = {
  async listar(params: {
    q?: string;
    pagina?: number;
    incluirUnificadas?: boolean;
  }): Promise<PessoaLista> {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.pagina) qs.set('pagina', String(params.pagina));
    if (params.incluirUnificadas) qs.set('incluirUnificadas', 'true');
    const res = await apiFetch(`/pessoas?${qs.toString()}`);
    return json<PessoaLista>(res);
  },
  async detalhe(id: string): Promise<PessoaDetalhe> {
    const res = await apiFetch(`/pessoas/${id}`);
    return json<PessoaDetalhe>(res);
  },
  async criar(body: {
    nome: string;
    tipo?: string;
    emails?: string[];
    telefones?: string[];
    documentos?: string[];
  }): Promise<PessoaDetalhe> {
    const res = await apiFetch('/pessoas', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return json<PessoaDetalhe>(res);
  },
  async patch(id: string, body: Record<string, unknown>): Promise<PessoaDetalhe> {
    const res = await apiFetch(`/pessoas/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return json<PessoaDetalhe>(res);
  },
  async merge(sobreviventeId: string, absorvidaId: string): Promise<PessoaDetalhe> {
    const res = await apiFetch(`/pessoas/${sobreviventeId}/merge`, {
      method: 'POST',
      body: JSON.stringify({ absorvidaId }),
    });
    return json<PessoaDetalhe>(res);
  },
  async desfazerMerge(sobreviventeId: string, mergeId: string): Promise<void> {
    await apiFetch(`/pessoas/${sobreviventeId}/merge/${mergeId}/desfazer`, {
      method: 'POST',
    });
  },
};

export function mensagemErro(err: unknown): string {
  const body = (err as { body?: unknown })?.body;
  if (body && typeof body === 'object' && 'message' in body) {
    const m = (body as { message: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return 'não foi possível concluir a ação';
}
