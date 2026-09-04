import { apiFetch } from '../auth/api-client';

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

// ---- tipos ----

export type AtendimentoCanal = 'WHATSAPP' | 'MANUAL';
export type AtendimentoStatus = 'AGUARDANDO' | 'EM_ATENDIMENTO' | 'ENCERRADO';
export type AtendimentoPrioridade = 'NORMAL' | 'ALTA' | 'URGENTE';

export interface SlaView {
  estourado: boolean;
  minutosDecorridos: number;
  minutosRestantes: number | null;
}

export interface AtendimentoView {
  id: string;
  pessoaId: string | null;
  leadId: string | null;
  canal: AtendimentoCanal;
  canalWhatsappId: string | null;
  equipeId: string | null;
  atendenteAtualId: string | null;
  status: AtendimentoStatus;
  prioridade: AtendimentoPrioridade;
  abertoEm: string;
  primeiraRespostaEm: string | null;
  encerradoEm: string | null;
  encerradoPorId: string | null;
  motivoEncerramento: string | null;
  csatSolicitadoEm: string | null;
  sla: SlaView;
}

export interface TransferenciaView {
  id: string;
  atendimentoId: string;
  deAtendenteId: string | null;
  paraAtendenteId: string | null;
  deEquipeId: string | null;
  paraEquipeId: string | null;
  transferidoPorId: string | null;
  motivo: string | null;
  criadoEm: string;
}

export interface InteracaoView {
  id: string;
  pessoaId: string | null;
  leadId: string | null;
  tipo: 'WHATSAPP' | 'EMAIL' | 'LIGACAO' | 'TICKET' | 'NOTA' | 'NPS';
  direcao: 'ENTRADA' | 'SAIDA' | null;
  conteudo: string;
  notaNps: number | null;
  autorId: string | null;
  ocorridoEm: string;
}

export interface EquipeAtendimentoConfig {
  slaPrimeiraRespostaMinutos: number | null;
  mensagemForaExpediente: string | null;
}

// ---- API ----

export const atendimentoApi = {
  listar: (p: { status?: AtendimentoStatus[]; prioridade?: AtendimentoPrioridade; equipeId?: string; mine?: boolean } = {}) => {
    const qs = new URLSearchParams();
    if (p.status?.length) qs.set('status', p.status.join(','));
    if (p.prioridade) qs.set('prioridade', p.prioridade);
    if (p.equipeId) qs.set('equipeId', p.equipeId);
    if (p.mine) qs.set('mine', 'true');
    return apiFetch(`/crm/atendimentos?${qs}`).then((r) => json<{ itens: AtendimentoView[] }>(r));
  },
  obter: (id: string) => apiFetch(`/crm/atendimentos/${id}`).then((r) => json<AtendimentoView>(r)),
  timeline: (id: string) =>
    apiFetch(`/crm/atendimentos/${id}/timeline`).then((r) => json<{ itens: InteracaoView[] }>(r)),
  transferencias: (id: string) =>
    apiFetch(`/crm/atendimentos/${id}/transferencias`).then((r) => json<{ itens: TransferenciaView[] }>(r)),

  criarManual: (body: { pessoaId?: string; leadId?: string }) =>
    apiFetch('/crm/atendimentos', { method: 'POST', body: JSON.stringify(body) }).then((r) =>
      json<{ atendimentoId: string; criado: boolean }>(r),
    ),
  assumir: (id: string) =>
    apiFetch(`/crm/atendimentos/${id}/assumir`, { method: 'POST' }).then((r) => json<AtendimentoView>(r)),
  responder: (id: string, body: { conteudo: string; viaIa?: boolean }) =>
    apiFetch(`/crm/atendimentos/${id}/responder`, { method: 'POST', body: JSON.stringify(body) }).then((r) =>
      json<{ interacaoId: string; respostaId: string; primeiraResposta: boolean }>(r),
    ),
  transferir: (id: string, body: { paraAtendenteId?: string; paraEquipeId?: string; motivo?: string }) =>
    apiFetch(`/crm/atendimentos/${id}/transferir`, { method: 'POST', body: JSON.stringify(body) }).then((r) =>
      json<{ transferenciaId: string; atendimento: AtendimentoView }>(r),
    ),
  encerrar: (id: string, motivo?: string) =>
    apiFetch(`/crm/atendimentos/${id}/encerrar`, { method: 'POST', body: JSON.stringify({ motivo }) }).then((r) =>
      json<AtendimentoView>(r),
    ),
  registrarCsat: (id: string, body: { nota: number; comentario?: string }) =>
    apiFetch(`/crm/atendimentos/${id}/csat`, { method: 'POST', body: JSON.stringify(body) }).then((r) =>
      json<{ interacaoId: string }>(r),
    ),

  obterConfigEquipe: (equipeId: string) =>
    apiFetch(`/crm/admin/atendimento/equipes/${equipeId}`).then((r) => json<EquipeAtendimentoConfig>(r)),
  configurarEquipe: (equipeId: string, body: Partial<EquipeAtendimentoConfig>) =>
    apiFetch(`/crm/admin/atendimento/equipes/${equipeId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }).then((r) => json<EquipeAtendimentoConfig>(r)),
};

export const STATUS_ROTULO: Record<AtendimentoStatus, string> = {
  AGUARDANDO: 'Aguardando',
  EM_ATENDIMENTO: 'Em atendimento',
  ENCERRADO: 'Encerrado',
};

export const PRIORIDADE_ROTULO: Record<AtendimentoPrioridade, string> = {
  NORMAL: 'Normal',
  ALTA: 'Alta',
  URGENTE: 'Urgente',
};

export function mensagemErro(err: unknown): string {
  return err instanceof Error ? err.message : 'erro inesperado';
}
