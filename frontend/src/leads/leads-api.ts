import { apiFetch } from '../auth/api-client';

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export type LeadEstagio =
  | 'NOVO'
  | 'CONTATO_FEITO'
  | 'QUALIFICADO'
  | 'NUTRICAO'
  | 'DESQUALIFICADO';
export type LeadStatus = 'ATIVO' | 'DESCARTADO' | 'CONVERTIDO';

export interface LeadView {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  documento: string | null;
  origem: string | null;
  idExterno: string | null;
  utm: {
    source: string | null;
    medium: string | null;
    campaign: string | null;
    term: string | null;
    content: string | null;
  };
  estagio: LeadEstagio;
  status: LeadStatus;
  responsavelId: string | null;
  tags: string[];
  score: number;
  scoreAtualizadoEm: string | null;
  pessoaId: string | null;
  convertidoEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
  campos?: Record<string, string>;
  leadsSemelhantes?: string[];
}

export interface Pagina<T> {
  itens: T[];
  pagina: number;
  tamanho: number;
  total: number;
}

export interface CampoDefView {
  id: string;
  chave: string;
  rotulo: string;
  tipo: 'TEXTO' | 'NUMERO' | 'BOOLEANO' | 'DATA' | 'SELECAO';
  opcoes: string[];
  obrigatorio: boolean;
  ativo: boolean;
}

export interface RegistroAuditoria {
  id: string;
  autor: string;
  quando: string;
  campo: string;
  motivo: string;
  valorAnterior: unknown;
  valorNovo: unknown;
}

export const leadsApi = {
  listar: (p: {
    estagio?: string;
    status?: string;
    origem?: string;
    responsavelId?: string;
    q?: string;
    pagina?: number;
    ordenarPor?: 'score' | 'criadoEm';
  }) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(p)) {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    }
    return apiFetch(`/crm/leads?${qs}`).then((r) => json<Pagina<LeadView>>(r));
  },
  obter: (id: string) => apiFetch(`/crm/leads/${id}`).then((r) => json<LeadView>(r)),
  auditoria: (id: string) =>
    apiFetch(`/crm/leads/${id}/auditoria`).then((r) => json<Pagina<RegistroAuditoria>>(r)),
  criar: (body: Record<string, unknown>) =>
    apiFetch('/crm/leads', { method: 'POST', body: JSON.stringify(body) }).then((r) =>
      json<LeadView>(r),
    ),
  patch: (id: string, body: Record<string, unknown>) =>
    apiFetch(`/crm/leads/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).then((r) =>
      json<LeadView>(r),
    ),
  addTag: (id: string, tag: string) =>
    apiFetch(`/crm/leads/${id}/tags`, { method: 'POST', body: JSON.stringify({ tag }) }).then(
      (r) => json<LeadView>(r),
    ),
  removerTag: (id: string, tag: string) =>
    apiFetch(`/crm/leads/${id}/tags`, { method: 'DELETE', body: JSON.stringify({ tag }) }).then(
      (r) => json<LeadView>(r),
    ),
  recalcularScore: (id: string) =>
    apiFetch(`/crm/leads/${id}/recalcular-score`, { method: 'POST', body: '{}' }).then((r) =>
      json<{ score: number }>(r),
    ),
  converter: (id: string) =>
    apiFetch(`/crm/leads/${id}/converter`, { method: 'POST', body: '{}' }).then((r) =>
      json<{ leadId: string; pessoaId: string; criouPessoa: boolean; status: string }>(r),
    ),
  campos: (id: string) =>
    apiFetch(`/crm/leads/${id}/campos-personalizados`).then((r) =>
      json<Record<string, string>>(r),
    ),
  putCampos: (id: string, valores: Record<string, string | number | boolean | null>) =>
    apiFetch(`/crm/leads/${id}/campos-personalizados`, {
      method: 'PUT',
      body: JSON.stringify(valores),
    }).then((r) => json<Record<string, string>>(r)),
  listarDefs: () =>
    apiFetch('/crm/admin/campos-lead').then((r) => json<CampoDefView[]>(r)),
};

export const ESTAGIOS: LeadEstagio[] = [
  'NOVO',
  'CONTATO_FEITO',
  'QUALIFICADO',
  'NUTRICAO',
  'DESQUALIFICADO',
];
