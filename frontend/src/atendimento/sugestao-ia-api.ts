import { apiFetch } from '../auth/api-client';

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export type SugestaoIaTipo = 'RESPOSTA' | 'CAMPO_PERSONALIZADO';
export type SugestaoIaStatus = 'PENDENTE' | 'ACEITA' | 'REJEITADA' | 'SUBSTITUIDA';

export interface SugestaoIaView {
  id: string;
  atendimentoId: string;
  tipo: SugestaoIaTipo;
  perguntaDetectada: string | null;
  faqItemId: string | null;
  campoPersonalizadoLeadId: string | null;
  campoPersonalizadoPessoaId: string | null;
  conteudoSugerido: string;
  conteudoFinal: string | null;
  status: SugestaoIaStatus;
  util: boolean | null;
  criadoEm: string;
}

export const sugestaoIaApi = {
  listar: (atendimentoId: string, interacaoId?: string) => {
    const qs = interacaoId ? `?interacaoId=${interacaoId}` : '';
    return apiFetch(`/crm/atendimentos/${atendimentoId}/sugestoes${qs}`).then((r) =>
      json<{ itens: SugestaoIaView[] }>(r),
    );
  },
  gerar: (atendimentoId: string, interacaoId: string) =>
    apiFetch(`/crm/atendimentos/${atendimentoId}/sugestoes`, {
      method: 'POST',
      body: JSON.stringify({ interacaoId }),
    }).then((r) => json<{ itens: SugestaoIaView[]; aviso: string | null }>(r)),
  aceitar: (atendimentoId: string, sugestaoId: string, conteudoFinal?: string) =>
    apiFetch(`/crm/atendimentos/${atendimentoId}/sugestoes/${sugestaoId}/aceitar`, {
      method: 'POST',
      body: JSON.stringify(conteudoFinal ? { conteudoFinal } : {}),
    }).then((r) => json<SugestaoIaView>(r)),
  rejeitar: (atendimentoId: string, sugestaoId: string) =>
    apiFetch(`/crm/atendimentos/${atendimentoId}/sugestoes/${sugestaoId}/rejeitar`, {
      method: 'POST',
    }).then((r) => json<SugestaoIaView>(r)),
  feedback: (atendimentoId: string, sugestaoId: string, util: boolean) =>
    apiFetch(`/crm/atendimentos/${atendimentoId}/sugestoes/${sugestaoId}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ util }),
    }).then((r) => json<SugestaoIaView>(r)),
};

export function mensagemErroSugestao(err: unknown): string {
  return err instanceof Error ? err.message : 'erro inesperado';
}
