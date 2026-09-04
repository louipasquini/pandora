import { apiFetch } from '../auth/api-client';

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
async function corpoDeErro(res: Response): Promise<string> {
  try {
    const b = (await res.json()) as { message?: string };
    return b.message ?? `erro ${res.status}`;
  } catch {
    return `erro ${res.status}`;
  }
}
async function checarOk(res: Response): Promise<Response> {
  if (!res.ok) throw new Error(await corpoDeErro(res));
  return res;
}

export type SegmentoAlvo = 'LEAD' | 'PESSOA';

export interface SegmentoView {
  id: string;
  nome: string;
  descricao: string | null;
  alvo: SegmentoAlvo;
  filtro: Record<string, unknown>;
  ativo: boolean;
  criadoPor: string;
  criadoEm: string;
  atualizadoEm: string;
}

export interface Pagina<T> {
  itens: T[];
  pagina: number;
  tamanho: number;
  total: number;
}

export const segmentosApi = {
  listar: () => apiFetch('/crm/segmentos').then(checarOk).then((r) => json<Pagina<SegmentoView>>(r)),
  obter: (id: string) => apiFetch(`/crm/segmentos/${id}`).then(checarOk).then((r) => json<SegmentoView>(r)),
  membros: (id: string) =>
    apiFetch(`/crm/segmentos/${id}/membros`)
      .then(checarOk)
      .then((r) => json<Pagina<Record<string, unknown>>>(r)),
  criar: (body: { nome: string; descricao?: string; alvo: SegmentoAlvo; filtro: Record<string, unknown> }) =>
    apiFetch('/crm/segmentos', { method: 'POST', body: JSON.stringify(body) })
      .then(checarOk)
      .then((r) => json<SegmentoView>(r)),
  atualizar: (id: string, body: Record<string, unknown>) =>
    apiFetch(`/crm/segmentos/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
      .then(checarOk)
      .then((r) => json<SegmentoView>(r)),
  remover: (id: string) => apiFetch(`/crm/segmentos/${id}`, { method: 'DELETE' }).then(checarOk),
};

export function mensagemErro(err: unknown): string {
  return err instanceof Error ? err.message : 'erro inesperado';
}
