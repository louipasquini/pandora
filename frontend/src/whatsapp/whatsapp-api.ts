import { apiFetch } from '../auth/api-client';

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

// ---- tipos ----

export interface CanalWhatsappView {
  id: string;
  nome: string;
  numeroTelefone: string;
  wabaId: string;
  phoneNumberId: string;
  ativo: boolean;
  ultimoWebhookRecebidoEm: string | null;
  accessTokenDefinido: boolean;
  accessTokenMascarado: string | null;
  appSecretDefinido: boolean;
  appSecretMascarado: string | null;
  webhookVerifyTokenDefinido: boolean;
  webhookVerifyTokenMascarado: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export type TemplateStatus = 'PENDENTE' | 'APROVADO' | 'REJEITADO' | 'PAUSADO' | 'DESABILITADO';

export interface TemplateWhatsappView {
  id: string;
  canalId: string;
  nomeMeta: string;
  idioma: string;
  categoria: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  corpo: string;
  statusAprovacao: TemplateStatus;
  motivoRejeicao: string | null;
  sincronizadoEm: string;
}

export interface Pagina<T> {
  itens: T[];
  pagina: number;
  tamanho: number;
  total: number;
}

export interface JanelaWhatsappView {
  dentroDaJanela: boolean;
  ultimaMensagemRecebidaEm: string | null;
}

export interface OptOutView {
  emOptOut: boolean;
  desde: string | null;
}

// ---- API ----

export const whatsappApi = {
  listarCanais: (p: { pagina?: number; tamanho?: number } = {}) => {
    const qs = new URLSearchParams();
    if (p.pagina) qs.set('pagina', String(p.pagina));
    if (p.tamanho) qs.set('tamanho', String(p.tamanho));
    return apiFetch(`/crm/admin/whatsapp/canais?${qs}`).then((r) =>
      json<Pagina<CanalWhatsappView>>(r),
    );
  },
  verCanal: (id: string) =>
    apiFetch(`/crm/admin/whatsapp/canais/${id}`).then((r) => json<CanalWhatsappView>(r)),
  criarCanal: (body: {
    nome: string;
    numeroTelefone: string;
    wabaId: string;
    phoneNumberId: string;
    accessToken: string;
    appSecret: string;
    webhookVerifyToken: string;
  }) =>
    apiFetch('/crm/admin/whatsapp/canais', { method: 'POST', body: JSON.stringify(body) }).then(
      (r) => json<CanalWhatsappView>(r),
    ),
  atualizarCanal: (id: string, body: Record<string, unknown>) =>
    apiFetch(`/crm/admin/whatsapp/canais/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }).then((r) => json<CanalWhatsappView>(r)),

  sincronizarTemplates: (canalId: string) =>
    apiFetch(`/crm/admin/whatsapp/canais/${canalId}/templates/sincronizar`, {
      method: 'POST',
    }).then((r) => json<{ sincronizados: number; templates: TemplateWhatsappView[] }>(r)),
  listarTemplates: (canalId: string, statusAprovacao?: TemplateStatus) => {
    const qs = new URLSearchParams();
    if (statusAprovacao) qs.set('statusAprovacao', statusAprovacao);
    return apiFetch(`/crm/admin/whatsapp/canais/${canalId}/templates?${qs}`).then((r) =>
      json<TemplateWhatsappView[]>(r),
    );
  },

  janela: (p: { pessoaId?: string; leadId?: string }) => {
    const qs = new URLSearchParams();
    if (p.pessoaId) qs.set('pessoaId', p.pessoaId);
    if (p.leadId) qs.set('leadId', p.leadId);
    return apiFetch(`/crm/whatsapp/janela?${qs}`).then((r) => json<JanelaWhatsappView>(r));
  },
  consultarOptOut: (telefone: string) =>
    apiFetch(`/crm/whatsapp/optout?${new URLSearchParams({ telefone })}`).then((r) =>
      json<OptOutView>(r),
    ),
  registrarOptOut: (body: { telefone: string; origem?: 'PROPRIO_NUMERO' | 'ATENDENTE' }) =>
    apiFetch('/crm/whatsapp/optout', { method: 'POST', body: JSON.stringify(body) }),
  reverterOptOut: (telefone: string) =>
    apiFetch('/crm/whatsapp/optout/reverter', {
      method: 'POST',
      body: JSON.stringify({ telefone }),
    }),
};

export const STATUS_ROTULO: Record<TemplateStatus, string> = {
  PENDENTE: 'Pendente',
  APROVADO: 'Aprovado',
  REJEITADO: 'Rejeitado',
  PAUSADO: 'Pausado',
  DESABILITADO: 'Desabilitado',
};
