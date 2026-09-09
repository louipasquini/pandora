import { apiFetch } from '../auth/api-client';

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export interface FaqItemView {
  id: string;
  pergunta: string;
  resposta: string;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export interface FaqVersaoView {
  id: string;
  pergunta: string;
  resposta: string;
  autor: string | null;
  criadoEm: string;
}

export const faqApi = {
  async listar(ativo?: boolean): Promise<FaqItemView[]> {
    const qs = ativo === undefined ? '' : `?ativo=${ativo}`;
    const res = await apiFetch(`/crm/admin/faq${qs}`);
    return (await json<{ itens: FaqItemView[] }>(res)).itens;
  },
  async versoes(id: string): Promise<FaqVersaoView[]> {
    const res = await apiFetch(`/crm/admin/faq/${id}/versoes`);
    return (await json<{ itens: FaqVersaoView[] }>(res)).itens;
  },
  async criar(body: { pergunta: string; resposta: string }): Promise<FaqItemView> {
    const res = await apiFetch('/crm/admin/faq', { method: 'POST', body: JSON.stringify(body) });
    return json<FaqItemView>(res);
  },
  async atualizar(
    id: string,
    body: { pergunta?: string; resposta?: string; ativo?: boolean },
  ): Promise<FaqItemView> {
    const res = await apiFetch(`/crm/admin/faq/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return json<FaqItemView>(res);
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
