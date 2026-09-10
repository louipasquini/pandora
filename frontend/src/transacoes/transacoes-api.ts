import { apiFetch } from '../auth/api-client';

export interface DinheiroView {
  valorInt: string;
  moeda: string;
}

export interface TransacaoListaItem {
  id: string;
  plataformaOrigem: string;
  idOrigem: string;
  tipoOrigem: string;
  statusOrigem: string;
  statusCanonico: string;
  classificacao: string;
  ocorridoEm: string | null;
  pessoaId: string | null;
  ehAfiliada: boolean;
  precisaRevisao: boolean;
  valorBruto: DinheiroView | null;
  valorLiquido: DinheiroView | null;
  eventoOrigemId: string | null;
}

export interface TransacaoLista {
  itens: TransacaoListaItem[];
  pagina: number;
  tamanho: number;
  total: number;
}

export interface TransacaoDetalhe extends Omit<TransacaoListaItem, 'pessoaId'> {
  pessoa: { id: string; nome: string } | null;
  ofertaId: string | null;
  contratoId: string | null;
  transacaoVinculadaId: string | null;
  taxas: DinheiroView | null;
  reembolso: DinheiroView | null;
  quantidade: number | null;
  ehRecorrencia: boolean;
  assinaturaCiclo: string | null;
  numeroCiclo: number | null;
  ofertaCodigoOrigem: string | null;
  ofertaNomeOrigem: string | null;
  motivoRevisao: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export interface ListarParams {
  plataformaOrigem?: string;
  statusCanonico?: string;
  classificacao?: string;
  pagoDeFato?: boolean;
  precisaRevisao?: boolean;
  q?: string;
  pagina?: number;
}

export const transacoesApi = {
  async listar(p: ListarParams): Promise<TransacaoLista> {
    const qs = new URLSearchParams();
    if (p.plataformaOrigem) qs.set('plataformaOrigem', p.plataformaOrigem);
    if (p.statusCanonico) qs.set('statusCanonico', p.statusCanonico);
    if (p.classificacao) qs.set('classificacao', p.classificacao);
    if (p.pagoDeFato) qs.set('pagoDeFato', 'true');
    if (p.precisaRevisao) qs.set('precisaRevisao', 'true');
    if (p.q) qs.set('q', p.q);
    if (p.pagina) qs.set('pagina', String(p.pagina));
    return json<TransacaoLista>(await apiFetch(`/financeiro/transacoes?${qs.toString()}`));
  },
  async detalhe(id: string): Promise<TransacaoDetalhe> {
    return json<TransacaoDetalhe>(await apiFetch(`/financeiro/transacoes/${id}`));
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

export const STATUS_CANONICOS = [
  'PENDENTE',
  'PAGO',
  'EM_ATRASO',
  'RECUSADO',
  'CANCELADO',
  'ESTORNADO',
  'CHARGEBACK',
  'DESCONHECIDO',
] as const;

/** `19700000` (escala ×10000) → `"1.970,00"`. Só exibição. */
export function formatarDinheiro(d: DinheiroView | null): string {
  if (!d) return '—';
  const negativo = d.valorInt.startsWith('-');
  const abs = negativo ? d.valorInt.slice(1) : d.valorInt;
  const padded = abs.padStart(5, '0');
  const inteiro = padded.slice(0, -4).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const centavos = padded.slice(-4, -2);
  return `${negativo ? '-' : ''}${d.moeda} ${inteiro},${centavos}`;
}
