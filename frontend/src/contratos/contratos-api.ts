import { apiFetch } from '../auth/api-client';

export interface DinheiroView {
  valorInt: string;
  moeda: string;
}

export interface ContratoListaItem {
  id: string;
  pessoa: { id: string; nome: string };
  produto: { id: string; codigo: string };
  statusCanonico: 'ATIVO' | 'EXPIRADO' | 'CANCELADO' | 'DESCONHECIDO';
  acessoLiberado: boolean;
  fimAcesso: string | null;
  ticketTotal: Record<string, string>;
  valorRecebido: Record<string, string>;
  ajusteManualStatus: string | null;
}

export interface ContratoLista {
  itens: ContratoListaItem[];
  pagina: number;
  tamanho: number;
  total: number;
}

export interface AditivoView {
  id: string;
  transacaoId: string;
  rotulo: 'COMPRA_INICIAL' | 'RENOVACAO' | 'PRORROGACAO' | 'REEMBOLSO' | 'SEM_EFEITO';
  ocorridoEm: string | null;
  fimAcessoResultante: string | null;
  valorBruto: DinheiroView | null;
  statusCanonicoTransacao: string;
  precisaRevisao: boolean;
  motivoRevisao: string | null;
}

export interface ContratoDetalhe extends ContratoListaItem {
  toleranciaAtrasoDias: number;
  contratoAssinado: boolean;
  ajusteManualEm: string | null;
  ajusteManualAutor: string | null;
  ajusteManualMotivo: string | null;
  criadoEm: string;
  atualizadoEm: string;
  aditivos: AditivoView[];
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export interface ListarParams {
  produtoCodigo?: string;
  pessoaId?: string;
  turma?: string;
  status?: string;
  pagina?: number;
}

export interface AjustarContratoBody {
  toleranciaAtrasoDias?: number;
  contratoAssinado?: boolean;
  ajusteManualStatus?: string | null;
  motivo: string;
}

export const contratosApi = {
  async listar(p: ListarParams): Promise<ContratoLista> {
    const qs = new URLSearchParams();
    if (p.produtoCodigo) qs.set('produtoCodigo', p.produtoCodigo);
    if (p.pessoaId) qs.set('pessoaId', p.pessoaId);
    if (p.turma) qs.set('turma', p.turma);
    if (p.status) qs.set('status', p.status);
    if (p.pagina) qs.set('pagina', String(p.pagina));
    return json<ContratoLista>(await apiFetch(`/contratos?${qs.toString()}`));
  },
  async detalhe(id: string): Promise<ContratoDetalhe> {
    return json<ContratoDetalhe>(await apiFetch(`/contratos/${id}`));
  },
  async ajustar(id: string, body: AjustarContratoBody): Promise<ContratoDetalhe> {
    return json<ContratoDetalhe>(
      await apiFetch(`/contratos/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    );
  },
};

export const STATUS_CONTRATO = ['ATIVO', 'EXPIRADO', 'CANCELADO', 'DESCONHECIDO'] as const;

export const ROTULO_LABEL: Record<AditivoView['rotulo'], string> = {
  COMPRA_INICIAL: 'Compra inicial',
  RENOVACAO: 'Renovação',
  PRORROGACAO: 'Prorrogação',
  REEMBOLSO: 'Reembolso',
  SEM_EFEITO: 'Sem efeito',
};

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

/** `{BRL: "19700000"}` → `"BRL 1.970,00"` por moeda, juntando com " · ". Só exibição. */
export function formatarDict(dict: Record<string, string>): string {
  const entradas = Object.entries(dict);
  if (entradas.length === 0) return '—';
  return entradas
    .map(([moeda, valorInt]) => formatarDinheiro({ valorInt, moeda }))
    .join(' · ');
}
