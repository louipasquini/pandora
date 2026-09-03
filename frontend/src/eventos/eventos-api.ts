import { apiFetch } from '../auth/api-client';

export interface EventoListaItem {
  id: string;
  plataformaOrigem: string;
  tipoOrigem: string;
  idOrigem: string;
  status: 'pendente' | 'ok' | 'erro' | 'revisar';
  classificacao: string | null;
  erroDetalhe: string | null;
  recebidoEm: string;
  reentregas: number;
}
export interface EventoLista {
  itens: EventoListaItem[];
  pagina: number;
  tamanho: number;
  total: number;
}
export interface EventoEtapaView {
  etapa: string;
  status: string;
  resultado: unknown;
  erroDetalhe: string | null;
  tentativas: number;
  executadoEm: string | null;
}
export interface EventoDetalhe {
  id: string;
  plataformaOrigem: string;
  tipoOrigem: string;
  idOrigem: string;
  hash: string;
  status: string;
  classificacao: string | null;
  erroDetalhe: string | null;
  recebidoEm: string;
  ultimoRecebidoEm: string;
  reentregas: number;
  payloadBruto: unknown;
  eventoCanonico: unknown;
  etapas: EventoEtapaView[];
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export interface ListarParams {
  status?: string; // CSV ou 'todos'
  plataformaOrigem?: string;
  tipoOrigem?: string;
  pagina?: number;
}

export const eventosApi = {
  async listar(p: ListarParams): Promise<EventoLista> {
    const qs = new URLSearchParams();
    if (p.status) qs.set('status', p.status);
    if (p.plataformaOrigem) qs.set('plataformaOrigem', p.plataformaOrigem);
    if (p.tipoOrigem) qs.set('tipoOrigem', p.tipoOrigem);
    if (p.pagina) qs.set('pagina', String(p.pagina));
    return json<EventoLista>(await apiFetch(`/ingestao/eventos?${qs.toString()}`));
  },
  async detalhe(id: string): Promise<EventoDetalhe> {
    return json<EventoDetalhe>(await apiFetch(`/ingestao/eventos/${id}`));
  },
  async reprocessar(id: string, forcar = false): Promise<void> {
    await apiFetch(`/ingestao/eventos/${id}/reprocessar`, {
      method: 'POST',
      body: JSON.stringify({ forcar }),
    });
  },
};

/** As 7 contas de origem — para o filtro do painel. */
export const CONTAS = [
  'TMB',
  'ASAAS_PRD',
  'ASAAS_SVC',
  'GURU_PRD',
  'GURU_SVC',
  'HOTMART_PRD',
  'HOTMART_SVC',
] as const;
