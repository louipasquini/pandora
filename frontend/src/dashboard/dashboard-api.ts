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

function qs(params: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

// ---------------------------------------------------------------- tipos
export type FormatoPainel = 'numero' | 'funil' | 'ranking' | 'tabela' | 'serie_temporal';

export interface Delta {
  valor: number;
  periodoAnterior: number;
  delta: number;
  deltaPercentual: number | null;
}
export interface ValorMoeda {
  moeda: string;
  valorInt: string;
}

export interface PeriodoView {
  de: string;
  ate: string;
  anteriorDe: string;
  anteriorAte: string;
  duracaoDias: number;
  bucket: 'dia' | 'semana' | 'mes';
}

export interface PainelView {
  id: string;
  titulo: string;
  formato: FormatoPainel;
  dados: unknown;
}

export interface DashboardView {
  periodo: PeriodoView;
  paineis: PainelView[];
}

export interface VisaoGeralDados {
  leadsNovos: Delta;
  oportunidadesCriadas: Delta;
  oportunidadesGanhas: Delta;
  oportunidadesPerdidas: Delta;
  valorEmAberto: ValorMoeda[];
  taxaConversao: number | null;
  tarefasConcluidasNoPrazo: Delta;
}

export interface FunilEtapa {
  etapaId: string;
  nome: string;
  tipo: 'ABERTA' | 'GANHA' | 'PERDIDA';
  quantidade: number;
  valorEstimado: ValorMoeda[];
  tempoMedioHoras: number | null;
}
export interface FunilDados {
  pipelineId: string | null;
  porEtapa: FunilEtapa[];
  taxaConversao: number | null;
}

export interface RankingItem {
  responsavelId: string;
  nome: string | null;
  oportunidadesGanhas: number;
  valorGanho: ValorMoeda[];
  taxaConversao: number | null;
  pontosTarefa: number;
}

export interface QualidadeAtendimentoDados {
  tempoMedioPrimeiraRespostaMinutos: Delta;
  percentualDentroSla: number | null;
  csatMedio: number | null;
  distribuicaoCsat: Record<string, number>;
  taxaResolucao: number | null;
  atendimentosAbertos: number;
  atendimentosEncerrados: number;
  porAtendente: {
    atendenteId: string | null;
    nome: string | null;
    atendimentos: number;
    tempoMedioRespostaMinutos: number | null;
  }[];
  porDia: { rotulo: string; abertos: number; encerrados: number }[];
}

export interface SerieTemporalDados {
  bucket: string;
  series: { nome: string; pontos: { rotulo: string; valor: number }[] }[];
}

export interface TabelaDados {
  colunas: string[];
  linhas: (string | number)[][];
}

export interface CatalogoPainel {
  id: string;
  titulo: string;
  formato: FormatoPainel;
  permissoes: string[];
  visivel: boolean;
}

export type MetaPeriodo = 'MES' | 'TRIMESTRE';
export type MetaStatus = 'no_caminho' | 'em_risco' | 'batida' | 'estourada';

export interface MetaView {
  id: string;
  metrica: string;
  periodo: MetaPeriodo;
  referencia: string;
  alvo: { valor: number } | { valorInt: string; moeda: string };
  escopo: { equipeId: string | null; responsavelId: string | null };
  descricao: string | null;
  inicio: string;
  fim: string;
  realizado: { valor: number } | { valorInt: string; moeda: string };
  percentual: number | null;
  status: MetaStatus;
  noRitmo: boolean;
}

export interface NotificacaoMeta {
  metaId: string;
  metrica: string;
  status: MetaStatus;
  percentual: number | null;
  referencia: string;
}

export interface VisaoView {
  id: string;
  nome: string;
  filtros: {
    periodo:
      | { tipo: 'relativo'; dias: number }
      | { tipo: 'absoluto'; de: string; ate: string };
    equipeId?: string;
    responsavelId?: string;
    pipelineId?: string;
  };
  paineis: string[];
  dono: boolean;
  somenteLeitura: boolean;
  perfilCompartilhadoId: string | null;
}

export interface FiltrosDashboard {
  de: string;
  ate: string;
  equipeId?: string;
  responsavelId?: string;
  pipelineId?: string;
}

export interface CriarMetaBody {
  metrica: string;
  periodo: MetaPeriodo;
  referencia: string;
  alvo: { valor: number } | { valorInt: string; moeda: string };
  equipeId?: string | null;
  responsavelId?: string | null;
  descricao?: string | null;
}

export interface CriarVisaoBody {
  nome: string;
  filtros: VisaoView['filtros'];
  paineis: string[];
  perfilCompartilhadoId?: string | null;
}

export const METRICAS_META: { id: string; rotulo: string; monetaria: boolean }[] = [
  { id: 'oportunidades_ganhas', rotulo: 'Oportunidades ganhas', monetaria: false },
  { id: 'valor_ganho', rotulo: 'Valor ganho', monetaria: true },
  { id: 'leads_novos', rotulo: 'Leads novos', monetaria: false },
  { id: 'tarefas_concluidas', rotulo: 'Tarefas concluídas', monetaria: false },
  { id: 'atendimentos_encerrados', rotulo: 'Atendimentos encerrados', monetaria: false },
];

export const dashboardApi = {
  montar: (f: FiltrosDashboard) =>
    apiFetch(`/crm/dashboard${qs(f as Record<string, unknown>)}`)
      .then(checarOk)
      .then((r) => json<DashboardView>(r)),
  catalogo: () =>
    apiFetch('/crm/dashboard/paineis')
      .then(checarOk)
      .then((r) => json<{ paineis: CatalogoPainel[] }>(r)),
  painelCsv: (id: string, f: FiltrosDashboard) =>
    apiFetch(`/crm/dashboard/paineis/${id}${qs({ ...f, formato: 'csv' })}`)
      .then(checarOk)
      .then((r) => r.text()),

  metas: (periodo?: MetaPeriodo, referencia?: string) =>
    apiFetch(`/crm/dashboard/metas${qs({ periodo, referencia })}`)
      .then(checarOk)
      .then((r) => json<{ itens: MetaView[] }>(r)),
  criarMeta: (body: CriarMetaBody) =>
    apiFetch('/crm/dashboard/metas', { method: 'POST', body: JSON.stringify(body) })
      .then(checarOk)
      .then((r) => json<MetaView>(r)),
  atualizarMeta: (id: string, body: Partial<CriarMetaBody>) =>
    apiFetch(`/crm/dashboard/metas/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
      .then(checarOk)
      .then((r) => json<MetaView>(r)),
  removerMeta: (id: string) =>
    apiFetch(`/crm/dashboard/metas/${id}`, { method: 'DELETE' }).then(checarOk),
  notificacoes: () =>
    apiFetch('/crm/dashboard/notificacoes')
      .then(checarOk)
      .then((r) => json<{ itens: NotificacaoMeta[] }>(r)),

  visoes: () =>
    apiFetch('/crm/dashboard/visoes')
      .then(checarOk)
      .then((r) => json<{ itens: VisaoView[] }>(r)),
  criarVisao: (body: CriarVisaoBody) =>
    apiFetch('/crm/dashboard/visoes', { method: 'POST', body: JSON.stringify(body) })
      .then(checarOk)
      .then((r) => json<VisaoView>(r)),
  clonarVisao: (id: string) =>
    apiFetch(`/crm/dashboard/visoes/${id}/clonar`, { method: 'POST' })
      .then(checarOk)
      .then((r) => json<VisaoView>(r)),
  removerVisao: (id: string) =>
    apiFetch(`/crm/dashboard/visoes/${id}`, { method: 'DELETE' }).then(checarOk),
};

export function fmtMoeda(v: ValorMoeda): string {
  // valorInt vem em escala ×10000 (Dinheiro do core).
  const n = Number(BigInt(v.valorInt)) / 10000;
  return `${v.moeda} ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtPct(n: number | null): string {
  return n == null ? '—' : `${(n * 100).toFixed(1)}%`;
}

export function fmtDelta(d: Delta): { texto: string; sinal: 'up' | 'down' | 'flat' } {
  const sinal = d.delta > 0 ? 'up' : d.delta < 0 ? 'down' : 'flat';
  const pct = d.deltaPercentual == null ? '—' : `${(d.deltaPercentual * 100).toFixed(0)}%`;
  const seta = sinal === 'up' ? '▲' : sinal === 'down' ? '▼' : '■';
  return { texto: `${seta} ${d.delta >= 0 ? '+' : ''}${d.delta} (${pct})`, sinal };
}
