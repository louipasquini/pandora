import { apiFetch } from '../auth/api-client';

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
async function corpoDeErro(res: Response): Promise<string> {
  try {
    const b = (await res.json()) as { message?: string; erro?: string };
    return b.message ?? b.erro ?? `erro ${res.status}`;
  } catch {
    return `erro ${res.status}`;
  }
}
async function checarOk(res: Response): Promise<Response> {
  if (!res.ok) throw new Error(await corpoDeErro(res));
  return res;
}

export function mensagemErro(err: unknown): string {
  return err instanceof Error ? err.message : 'erro inesperado';
}

export type TarefaStatus = 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA';

export interface ChecklistItemView {
  id: string;
  texto: string;
  concluido: boolean;
  ordem: number;
}

export interface TarefaView {
  id: string;
  titulo: string;
  descricao: string | null;
  status: TarefaStatus;
  dataVencimento: string | null;
  concluidoEm: string | null;
  pessoaId: string | null;
  leadId: string | null;
  oportunidadeId: string | null;
  responsavelId: string | null;
  criadoPorId: string | null;
  origem: string;
  criadoEm: string;
  atualizadoEm: string;
  checklist: ChecklistItemView[];
  progressoChecklist: { concluidos: number; total: number };
  tempoTotalSegundos: number;
  vencendoHoje: boolean;
  atrasada: boolean;
}

export interface PeriodoCronometroView {
  id: string;
  inicio: string;
  fim: string | null;
}

export interface NotaTarefaView {
  id: string;
  autorId: string | null;
  conteudo: string;
  criadoEm: string;
}

export interface DependenciaView {
  id: string;
  dependeDeId: string;
  dependeDe: { id: string; titulo: string; status: TarefaStatus };
}

export interface DelegacaoView {
  id: string;
  deResponsavelId: string | null;
  paraResponsavelId: string | null;
  autorId: string | null;
  motivo: string | null;
  criadoEm: string;
}

export interface RankingEntrada {
  responsavelId: string;
  pontos: number;
  tarefasConcluidas: number;
}

export interface ListarTarefasParams {
  status?: TarefaStatus;
  responsavelId?: string;
  pessoaId?: string;
  leadId?: string;
  oportunidadeId?: string;
  vencimentoDe?: string;
  vencimentoAte?: string;
  vencendoHoje?: boolean;
  atrasada?: boolean;
  pagina?: number;
  tamanho?: number;
}

function qs(params: Record<string, unknown> | ListarTarefasParams): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export interface CriarTarefaBody {
  titulo: string;
  descricao?: string;
  dataVencimento?: string;
  responsavelId?: string;
  pessoaId?: string;
  leadId?: string;
  oportunidadeId?: string;
  checklist?: string[];
}

export const tarefasApi = {
  listar: (params: ListarTarefasParams = {}) =>
    apiFetch(`/crm/tarefas${qs(params)}`)
      .then(checarOk)
      .then((r) => json<{ itens: TarefaView[]; pagina: number; tamanho: number; total: number }>(r)),
  obter: (id: string) => apiFetch(`/crm/tarefas/${id}`).then(checarOk).then((r) => json<TarefaView>(r)),
  criar: (body: CriarTarefaBody) =>
    apiFetch('/crm/tarefas', { method: 'POST', body: JSON.stringify(body) })
      .then(checarOk)
      .then((r) => json<TarefaView>(r)),
  atualizar: (id: string, body: Partial<CriarTarefaBody>) =>
    apiFetch(`/crm/tarefas/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
      .then(checarOk)
      .then((r) => json<TarefaView>(r)),
  mudarStatus: (id: string, status: TarefaStatus) =>
    apiFetch(`/crm/tarefas/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) })
      .then(checarOk)
      .then((r) => json<TarefaView>(r)),
  delegar: (id: string, responsavelId: string | null, motivo?: string) =>
    apiFetch(`/crm/tarefas/${id}/delegar`, {
      method: 'POST',
      body: JSON.stringify({ responsavelId, motivo }),
    })
      .then(checarOk)
      .then((r) => json<TarefaView>(r)),
  listarDelegacoes: (id: string) =>
    apiFetch(`/crm/tarefas/${id}/delegacoes`)
      .then(checarOk)
      .then((r) => json<{ itens: DelegacaoView[] }>(r)),

  criarItemChecklist: (id: string, texto: string) =>
    apiFetch(`/crm/tarefas/${id}/checklist`, { method: 'POST', body: JSON.stringify({ texto }) })
      .then(checarOk)
      .then((r) => json<ChecklistItemView>(r)),
  atualizarItemChecklist: (id: string, itemId: string, body: Partial<ChecklistItemView>) =>
    apiFetch(`/crm/tarefas/${id}/checklist/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
      .then(checarOk)
      .then((r) => json<ChecklistItemView>(r)),
  removerItemChecklist: (id: string, itemId: string) =>
    apiFetch(`/crm/tarefas/${id}/checklist/${itemId}`, { method: 'DELETE' }).then(checarOk),

  iniciarCronometro: (id: string) =>
    apiFetch(`/crm/tarefas/${id}/cronometro/iniciar`, { method: 'POST' })
      .then(checarOk)
      .then((r) => json<PeriodoCronometroView>(r)),
  pararCronometro: (id: string) =>
    apiFetch(`/crm/tarefas/${id}/cronometro/parar`, { method: 'POST' })
      .then(checarOk)
      .then((r) => json<PeriodoCronometroView>(r)),
  obterCronometro: (id: string) =>
    apiFetch(`/crm/tarefas/${id}/cronometro`)
      .then(checarOk)
      .then((r) => json<{ periodos: PeriodoCronometroView[]; tempoTotalSegundos: number }>(r)),

  criarNota: (id: string, conteudo: string) =>
    apiFetch(`/crm/tarefas/${id}/notas`, { method: 'POST', body: JSON.stringify({ conteudo }) })
      .then(checarOk)
      .then((r) => json<NotaTarefaView>(r)),
  listarNotas: (id: string) =>
    apiFetch(`/crm/tarefas/${id}/notas`)
      .then(checarOk)
      .then((r) => json<{ itens: NotaTarefaView[] }>(r)),

  adicionarDependencia: (id: string, dependeDeId: string) =>
    apiFetch(`/crm/tarefas/${id}/dependencias`, {
      method: 'POST',
      body: JSON.stringify({ dependeDeId }),
    }).then(checarOk),
  removerDependencia: (id: string, dependeDeId: string) =>
    apiFetch(`/crm/tarefas/${id}/dependencias/${dependeDeId}`, { method: 'DELETE' }).then(checarOk),
  listarDependencias: (id: string) =>
    apiFetch(`/crm/tarefas/${id}/dependencias`)
      .then(checarOk)
      .then((r) => json<{ itens: DependenciaView[] }>(r)),

  notificacoes: () =>
    apiFetch('/crm/tarefas/notificacoes')
      .then(checarOk)
      .then((r) => json<{ itens: TarefaView[] }>(r)),
  ranking: (desde?: string, ate?: string) =>
    apiFetch(`/crm/tarefas/ranking${qs({ desde, ate })}`)
      .then(checarOk)
      .then((r) => json<RankingEntrada[]>(r)),
};

export const STATUS_ROTULO: Record<TarefaStatus, string> = {
  PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
};
