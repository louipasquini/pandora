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

export type InteracaoTipo = 'WHATSAPP' | 'EMAIL' | 'LIGACAO' | 'TICKET' | 'NOTA' | 'NPS';
export type InteracaoDirecao = 'ENTRADA' | 'SAIDA';

export interface InteracaoView {
  id: string;
  pessoaId: string | null;
  leadId: string | null;
  tipo: InteracaoTipo;
  direcao: InteracaoDirecao | null;
  conteudo: string;
  notaNps: number | null;
  autorId: string | null;
  ocorridoEm: string;
  editadoEm: string | null;
  removidoEm: string | null;
  criadoEm: string;
}

export interface Pagina<T> {
  itens: T[];
  pagina: number;
  tamanho: number;
  total: number;
}

export type AncoraInteracao = { pessoaId: string } | { leadId: string };

function ancoraPath(ancora: AncoraInteracao): string {
  return 'pessoaId' in ancora
    ? `/crm/pessoas/${ancora.pessoaId}/interacoes`
    : `/crm/leads/${ancora.leadId}/interacoes`;
}

export const interacoesApi = {
  timeline: (ancora: AncoraInteracao) =>
    apiFetch(ancoraPath(ancora))
      .then(checarOk)
      .then((r) => json<Pagina<InteracaoView>>(r)),
  criar: (ancora: AncoraInteracao, body: Record<string, unknown>) =>
    apiFetch('/crm/interacoes', {
      method: 'POST',
      body: JSON.stringify({ ...ancora, ...body }),
    })
      .then(checarOk)
      .then((r) => json<InteracaoView>(r)),
  editar: (id: string, conteudo: string) =>
    apiFetch(`/crm/interacoes/${id}`, { method: 'PATCH', body: JSON.stringify({ conteudo }) })
      .then(checarOk)
      .then((r) => json<InteracaoView>(r)),
  remover: (id: string) =>
    apiFetch(`/crm/interacoes/${id}`, { method: 'DELETE' })
      .then(checarOk)
      .then((r) => json<InteracaoView>(r)),
};

// ------------------------------------------------------------------- tags

export type AncoraTag = { tipo: 'lead' | 'pessoa' | 'interacao'; id: string };

function tagsPath(ancora: AncoraTag): string {
  const prefixo = ancora.tipo === 'lead' ? 'leads' : ancora.tipo === 'pessoa' ? 'pessoas' : 'interacoes';
  return `/crm/${prefixo}/${ancora.id}/tags`;
}

export const tagsApi = {
  listarDe: (ancora: AncoraTag) =>
    apiFetch(tagsPath(ancora))
      .then(checarOk)
      .then((r) => json<{ tags: string[] }>(r)),
  catalogo: () =>
    apiFetch('/crm/tags')
      .then(checarOk)
      .then((r) => json<{ id: string; slug: string; rotulo: string; cor: string | null; ativo: boolean }[]>(r)),
  associar: (ancora: AncoraTag, tag: string) =>
    apiFetch(tagsPath(ancora), { method: 'POST', body: JSON.stringify({ tag }) })
      .then(checarOk)
      .then((r) => json<{ tags: string[] }>(r)),
  desassociar: (ancora: AncoraTag, tag: string) =>
    apiFetch(tagsPath(ancora), { method: 'DELETE', body: JSON.stringify({ tag }) })
      .then(checarOk)
      .then((r) => json<{ tags: string[] }>(r)),
};

export function mensagemErro(err: unknown): string {
  return err instanceof Error ? err.message : 'erro inesperado';
}
