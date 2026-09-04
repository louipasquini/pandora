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

export type EtapaTipo = 'ABERTA' | 'GANHA' | 'PERDIDA';
export type ModoAtribuicao = 'MANUAL' | 'RODIZIO' | 'REGRA';

export interface EtapaView {
  id: string;
  pipelineId: string;
  nome: string;
  ordem: number;
  tipo: EtapaTipo;
  slaHoras: number | null;
}

export interface PipelineView {
  id: string;
  nome: string;
  descricao: string | null;
  equipeId: string | null;
  modoAtribuicao: ModoAtribuicao;
  atribuicaoFallback: 'RODIZIO' | null;
  diasEsfriando: number | null;
  ativo: boolean;
  etapas?: EtapaView[];
}

export interface Dinheiro {
  valorInt: string;
  moeda: string;
}

export interface OportunidadeView {
  id: string;
  pipelineId: string;
  etapaId: string;
  pessoaId: string | null;
  leadId: string | null;
  titulo: string;
  valorEstimado: Dinheiro;
  responsavelId: string | null;
  dataPrevistaFechamento: string | null;
  entrouEtapaEm: string;
  status: EtapaTipo;
  slaEstourado: boolean;
  esfriando: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export interface Pagina<T> {
  itens: T[];
  pagina: number;
  tamanho: number;
  total: number;
}

export interface RegraAtribuicao {
  ordem: number;
  campo: 'ORIGEM' | 'VALOR_ESTIMADO_MINIMO';
  valor: Record<string, string>;
  responsavelId: string;
}

export interface AtribuicaoConfig {
  modoAtribuicao: ModoAtribuicao;
  atribuicaoFallback: 'RODIZIO' | null;
  regras: RegraAtribuicao[];
}

export interface MetricaEtapa {
  etapaId: string;
  nome: string;
  tipo: EtapaTipo;
  quantidade: number;
  valorEstimado: Dinheiro[];
  tempoMedioHoras: number | null;
}

export interface Metricas {
  porEtapa: MetricaEtapa[];
  taxaConversao: number | null;
}

export interface MovimentacaoView {
  id: string;
  oportunidadeId: string;
  etapaAnteriorId: string | null;
  etapaNovaId: string;
  movidoPorId: string | null;
  motivo: string | null;
  criadoEm: string;
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

export const pipelinesApi = {
  listar: (ativo?: boolean) =>
    apiFetch(`/crm/pipelines${ativo === undefined ? '' : `?ativo=${ativo}`}`)
      .then(checarOk)
      .then((r) => json<{ itens: PipelineView[] }>(r)),
  obter: (id: string) =>
    apiFetch(`/crm/pipelines/${id}`).then(checarOk).then((r) => json<PipelineView>(r)),
  criar: (body: Record<string, unknown>) =>
    apiFetch('/crm/pipelines', { method: 'POST', body: JSON.stringify(body) })
      .then(checarOk)
      .then((r) => json<PipelineView>(r)),
  patch: (id: string, body: Record<string, unknown>) =>
    apiFetch(`/crm/pipelines/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
      .then(checarOk)
      .then((r) => json<PipelineView>(r)),
  listarEtapas: (id: string) =>
    apiFetch(`/crm/pipelines/${id}/etapas`)
      .then(checarOk)
      .then((r) => json<{ itens: EtapaView[] }>(r)),
  criarEtapa: (id: string, body: Record<string, unknown>) =>
    apiFetch(`/crm/pipelines/${id}/etapas`, { method: 'POST', body: JSON.stringify(body) })
      .then(checarOk)
      .then((r) => json<EtapaView>(r)),
  patchEtapa: (id: string, etapaId: string, body: Record<string, unknown>) =>
    apiFetch(`/crm/pipelines/${id}/etapas/${etapaId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
      .then(checarOk)
      .then((r) => json<EtapaView>(r)),
  removerEtapa: (id: string, etapaId: string) =>
    apiFetch(`/crm/pipelines/${id}/etapas/${etapaId}`, { method: 'DELETE' }).then(checarOk),
  obterAtribuicao: (id: string) =>
    apiFetch(`/crm/pipelines/${id}/atribuicao`)
      .then(checarOk)
      .then((r) => json<AtribuicaoConfig>(r)),
  substituirAtribuicao: (id: string, body: AtribuicaoConfig) =>
    apiFetch(`/crm/pipelines/${id}/atribuicao`, { method: 'PUT', body: JSON.stringify(body) })
      .then(checarOk)
      .then((r) => json<AtribuicaoConfig>(r)),
  metricas: (id: string) =>
    apiFetch(`/crm/pipelines/${id}/metricas`).then(checarOk).then((r) => json<Metricas>(r)),

  listarOportunidades: (p: {
    pipelineId?: string;
    etapaId?: string;
    responsavelId?: string;
    slaEstourado?: boolean;
    esfriando?: boolean;
  }) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(p)) {
      if (v !== undefined) qs.set(k, String(v));
    }
    return apiFetch(`/crm/oportunidades?${qs}`)
      .then(checarOk)
      .then((r) => json<Pagina<OportunidadeView>>(r));
  },
  obterOportunidade: (id: string) =>
    apiFetch(`/crm/oportunidades/${id}`).then(checarOk).then((r) => json<OportunidadeView>(r)),
  criarOportunidade: (body: Record<string, unknown>) =>
    apiFetch('/crm/oportunidades', { method: 'POST', body: JSON.stringify(body) })
      .then(checarOk)
      .then((r) => json<OportunidadeView>(r)),
  atualizarOportunidade: (id: string, body: Record<string, unknown>) =>
    apiFetch(`/crm/oportunidades/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
      .then(checarOk)
      .then((r) => json<OportunidadeView>(r)),
  mover: (id: string, etapaId: string, motivo?: string) =>
    apiFetch(`/crm/oportunidades/${id}/mover`, {
      method: 'POST',
      body: JSON.stringify({ etapaId, ...(motivo ? { motivo } : {}) }),
    })
      .then(checarOk)
      .then((r) => json<OportunidadeView>(r)),
  movimentacoes: (id: string) =>
    apiFetch(`/crm/oportunidades/${id}/movimentacoes`)
      .then(checarOk)
      .then((r) => json<{ itens: MovimentacaoView[] }>(r)),
  camposDaOportunidade: (id: string) =>
    apiFetch(`/crm/oportunidades/${id}/campos-personalizados`)
      .then(checarOk)
      .then((r) => json<Record<string, string>>(r)),
  putCamposDaOportunidade: (id: string, valores: Record<string, string | number | boolean | null>) =>
    apiFetch(`/crm/oportunidades/${id}/campos-personalizados`, {
      method: 'PUT',
      body: JSON.stringify(valores),
    })
      .then(checarOk)
      .then((r) => json<Record<string, string>>(r)),

  listarCamposDefs: () =>
    apiFetch('/crm/admin/campos-oportunidade')
      .then(checarOk)
      .then((r) => json<{ itens: CampoDefView[] }>(r)),
  criarCampoDef: (body: Record<string, unknown>) =>
    apiFetch('/crm/admin/campos-oportunidade', { method: 'POST', body: JSON.stringify(body) })
      .then(checarOk)
      .then((r) => json<CampoDefView>(r)),
  patchCampoDef: (id: string, body: Record<string, unknown>) =>
    apiFetch(`/crm/admin/campos-oportunidade/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
      .then(checarOk)
      .then((r) => json<CampoDefView>(r)),
};

export function formatarDinheiro(d: Dinheiro): string {
  const valor = Number(BigInt(d.valorInt)) / 10000;
  return `${d.moeda} ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}
