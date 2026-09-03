import { apiFetch } from '../auth/api-client';

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

// ---- tipos ----

export interface EquipeResumo {
  id: string;
  nome: string;
  tipo: 'COMERCIAL' | 'ATENDIMENTO' | 'CS';
  ativo: boolean;
  totalMembrosAtivos: number;
  criadoEm: string;
  atualizadoEm: string;
}
export interface MembroView {
  usuarioId: string;
  nome?: string;
  email?: string;
  papel: 'LIDER' | 'MEMBRO';
  entrouEm: string;
  saiuEm?: string | null;
}
export interface EquipeDetalhe extends Omit<EquipeResumo, 'totalMembrosAtivos'> {
  descricao: string | null;
  membrosAtivos: MembroView[];
  historicoMembros: MembroView[];
}
export interface JanelaView {
  id: string;
  equipeId: string | null;
  diaSemana: number;
  horaInicio: string;
  horaFim: string;
  ativo: boolean;
}
export interface FeriadoView {
  id: string;
  equipeId: string | null;
  data: string;
  descricao: string;
  recorrenteAnual: boolean;
}
export interface IntegracaoView {
  id: string;
  nome: string;
  tipo: 'API_KEY' | 'WEBHOOK' | 'CONEXAO_INTERNA';
  alvo: 'FINANCEIRO' | 'MARKETING' | 'CENTRAL' | 'EXTERNO';
  config: unknown;
  ativo: boolean;
  ultimoUsoEm: string | null;
  segredoDefinido: boolean;
  segredoMascarado: string | null;
}
export interface IntegracaoCriada {
  integracao: IntegracaoView;
  apiKey?: string;
  aviso?: string;
}
export interface Pagina<T> {
  itens: T[];
  pagina: number;
  tamanho: number;
  total: number;
}

// ---- API ----

export const crmAdminApi = {
  // equipes
  listarEquipes: (p: { ativo?: boolean; tipo?: string; usuarioId?: string; pagina?: number }) => {
    const qs = new URLSearchParams();
    if (p.ativo !== undefined) qs.set('ativo', String(p.ativo));
    if (p.tipo) qs.set('tipo', p.tipo);
    if (p.usuarioId) qs.set('usuarioId', p.usuarioId);
    if (p.pagina) qs.set('pagina', String(p.pagina));
    return apiFetch(`/crm/admin/equipes?${qs}`).then((r) => json<Pagina<EquipeResumo>>(r));
  },
  verEquipe: (id: string) =>
    apiFetch(`/crm/admin/equipes/${id}`).then((r) => json<EquipeDetalhe>(r)),
  criarEquipe: (body: { nome: string; descricao?: string; tipo: string }) =>
    apiFetch('/crm/admin/equipes', { method: 'POST', body: JSON.stringify(body) }).then((r) =>
      json<EquipeDetalhe>(r),
    ),
  patchEquipe: (id: string, body: Record<string, unknown>) =>
    apiFetch(`/crm/admin/equipes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).then(
      (r) => json<EquipeDetalhe>(r),
    ),
  addMembro: (id: string, body: { usuarioId: string; papel: string }) =>
    apiFetch(`/crm/admin/equipes/${id}/membros`, {
      method: 'POST',
      body: JSON.stringify(body),
    }).then((r) => json<MembroView>(r)),
  removerMembro: (id: string, usuarioId: string) =>
    apiFetch(`/crm/admin/equipes/${id}/membros/${usuarioId}`, { method: 'DELETE' }),

  // expediente
  listarJanelas: (equipeId?: string) => {
    const qs = new URLSearchParams();
    if (equipeId) qs.set('equipeId', equipeId);
    return apiFetch(`/crm/admin/janelas-atendimento?${qs}`).then((r) =>
      json<{ itens: JanelaView[] }>(r),
    );
  },
  criarJanela: (body: Record<string, unknown>) =>
    apiFetch('/crm/admin/janelas-atendimento', {
      method: 'POST',
      body: JSON.stringify(body),
    }).then((r) => json<JanelaView>(r)),
  removerJanela: (id: string) =>
    apiFetch(`/crm/admin/janelas-atendimento/${id}`, { method: 'DELETE' }),
  listarFeriados: (equipeId?: string) => {
    const qs = new URLSearchParams();
    if (equipeId) qs.set('equipeId', equipeId);
    return apiFetch(`/crm/admin/feriados?${qs}`).then((r) => json<{ itens: FeriadoView[] }>(r));
  },
  criarFeriado: (body: Record<string, unknown>) =>
    apiFetch('/crm/admin/feriados', { method: 'POST', body: JSON.stringify(body) }).then((r) =>
      json<FeriadoView>(r),
    ),
  removerFeriado: (id: string) => apiFetch(`/crm/admin/feriados/${id}`, { method: 'DELETE' }),
  expediente: (p: { instante?: string; equipeId?: string }) => {
    const qs = new URLSearchParams();
    if (p.instante) qs.set('instante', p.instante);
    if (p.equipeId) qs.set('equipeId', p.equipeId);
    return apiFetch(`/crm/admin/expediente?${qs}`).then((r) =>
      json<{ emExpediente: boolean; instante: string; equipeId: string | null }>(r),
    );
  },

  // integrações
  listarIntegracoes: (p: { tipo?: string; alvo?: string; ativo?: boolean; pagina?: number }) => {
    const qs = new URLSearchParams();
    if (p.tipo) qs.set('tipo', p.tipo);
    if (p.alvo) qs.set('alvo', p.alvo);
    if (p.ativo !== undefined) qs.set('ativo', String(p.ativo));
    if (p.pagina) qs.set('pagina', String(p.pagina));
    return apiFetch(`/crm/admin/integracoes?${qs}`).then((r) =>
      json<Pagina<IntegracaoView>>(r),
    );
  },
  criarIntegracao: (body: Record<string, unknown>) =>
    apiFetch('/crm/admin/integracoes', { method: 'POST', body: JSON.stringify(body) }).then(
      (r) => json<IntegracaoCriada>(r),
    ),
  rotacionar: (id: string) =>
    apiFetch(`/crm/admin/integracoes/${id}/rotacionar`, {
      method: 'POST',
      body: JSON.stringify({}),
    }).then((r) => json<IntegracaoCriada>(r)),
  patchIntegracao: (id: string, body: Record<string, unknown>) =>
    apiFetch(`/crm/admin/integracoes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }).then((r) => json<IntegracaoView>(r)),
};

export const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
