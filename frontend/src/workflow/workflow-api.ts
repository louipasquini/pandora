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

// --- Catálogo fechado (espelha backend/src/crm/domain/workflow, spec 014) --

export type GatilhoTipo =
  | 'LEAD_CRIADO'
  | 'LEAD_ESTAGIO_MUDOU'
  | 'OPORTUNIDADE_ETAPA_MUDOU'
  | 'INTERACAO_REGISTRADA'
  | 'TAG_APLICADA'
  | 'EVENTO_EXTERNO';

export const GATILHO_TIPOS: GatilhoTipo[] = [
  'LEAD_CRIADO',
  'LEAD_ESTAGIO_MUDOU',
  'OPORTUNIDADE_ETAPA_MUDOU',
  'INTERACAO_REGISTRADA',
  'TAG_APLICADA',
  'EVENTO_EXTERNO',
];

export const GATILHO_ROTULOS: Record<GatilhoTipo, string> = {
  LEAD_CRIADO: 'Lead criado',
  LEAD_ESTAGIO_MUDOU: 'Lead mudou de estágio',
  OPORTUNIDADE_ETAPA_MUDOU: 'Oportunidade mudou de etapa',
  INTERACAO_REGISTRADA: 'Nova interação registrada',
  TAG_APLICADA: 'Tag aplicada',
  EVENTO_EXTERNO: 'Evento externo (aguardando integração futura)',
};

export type RegistroTipo = 'LEAD' | 'OPORTUNIDADE';

/** A qual tipo de registro cada gatilho resolve (research.md D-R4). */
export function registroTipoDoGatilho(tipo: GatilhoTipo): RegistroTipo | null {
  if (tipo === 'OPORTUNIDADE_ETAPA_MUDOU') return 'OPORTUNIDADE';
  if (tipo === 'EVENTO_EXTERNO') return null;
  return 'LEAD';
}

export type CampoTipo = 'texto' | 'numero' | 'booleano' | 'lista';
export interface CampoCondicao {
  campo: string;
  tipo: CampoTipo;
}

const CAMPOS_LEAD: CampoCondicao[] = [
  { campo: 'estagio', tipo: 'texto' },
  { campo: 'status', tipo: 'texto' },
  { campo: 'origem', tipo: 'texto' },
  { campo: 'temResponsavel', tipo: 'booleano' },
  { campo: 'tags', tipo: 'lista' },
  { campo: 'score', tipo: 'numero' },
];
const CAMPOS_OPORTUNIDADE: CampoCondicao[] = [
  { campo: 'etapaTipo', tipo: 'texto' },
  { campo: 'pipelineId', tipo: 'texto' },
  { campo: 'valorEstimadoMoeda', tipo: 'texto' },
  { campo: 'temResponsavel', tipo: 'booleano' },
];

/** research.md D-R3 — catálogo fechado de campos avaliáveis por gatilho. */
export function camposDoGatilho(tipo: GatilhoTipo): CampoCondicao[] {
  if (tipo === 'OPORTUNIDADE_ETAPA_MUDOU') return CAMPOS_OPORTUNIDADE;
  if (tipo === 'EVENTO_EXTERNO') return [];
  return CAMPOS_LEAD;
}

export type AcaoTipo =
  | 'MOVER_LEAD_ESTAGIO'
  | 'APLICAR_TAG'
  | 'REMOVER_TAG'
  | 'REGISTRAR_NOTA'
  | 'MOVER_OPORTUNIDADE_ETAPA'
  | 'CRIAR_TAREFA';

export const ACAO_ROTULOS: Record<AcaoTipo, string> = {
  MOVER_LEAD_ESTAGIO: 'Mover lead para outro estágio',
  APLICAR_TAG: 'Aplicar tag',
  REMOVER_TAG: 'Remover tag',
  REGISTRAR_NOTA: 'Registrar nota',
  MOVER_OPORTUNIDADE_ETAPA: 'Mover oportunidade para outra etapa',
  CRIAR_TAREFA: 'Criar tarefa (spec 016)',
};

/** contracts/workflow.md — catálogo fechado de ações compatíveis por gatilho. */
export function acoesCompativeis(tipo: GatilhoTipo): AcaoTipo[] {
  if (tipo === 'OPORTUNIDADE_ETAPA_MUDOU') return ['MOVER_OPORTUNIDADE_ETAPA', 'CRIAR_TAREFA'];
  if (tipo === 'EVENTO_EXTERNO') {
    return [
      'MOVER_LEAD_ESTAGIO',
      'APLICAR_TAG',
      'REMOVER_TAG',
      'REGISTRAR_NOTA',
      'MOVER_OPORTUNIDADE_ETAPA',
      'CRIAR_TAREFA',
    ];
  }
  return ['MOVER_LEAD_ESTAGIO', 'APLICAR_TAG', 'REMOVER_TAG', 'REGISTRAR_NOTA', 'CRIAR_TAREFA'];
}

export type OperadorCondicao =
  | 'igual'
  | 'diferente'
  | 'contem'
  | 'nao_contem'
  | 'definido'
  | 'nao_definido'
  | 'maior_que'
  | 'menor_que';

export const OPERADOR_ROTULOS: Record<OperadorCondicao, string> = {
  igual: 'é igual a',
  diferente: 'é diferente de',
  contem: 'contém',
  nao_contem: 'não contém',
  definido: 'está definido',
  nao_definido: 'não está definido',
  maior_que: 'é maior que',
  menor_que: 'é menor que',
};

export type CondicaoFolha = {
  tipo: 'folha';
  campo: string;
  operador: OperadorCondicao;
  valor?: string | number | boolean;
};
export type CondicaoGrupo = { tipo: 'grupo'; operador: 'E' | 'OU'; itens: CondicaoNo[] };
export type CondicaoNo = CondicaoFolha | CondicaoGrupo;

export type AcaoFluxo =
  | { tipo: 'MOVER_LEAD_ESTAGIO'; estagioDestino: string }
  | { tipo: 'APLICAR_TAG'; tag: string }
  | { tipo: 'REMOVER_TAG'; tag: string }
  | { tipo: 'REGISTRAR_NOTA'; conteudo: string }
  | { tipo: 'MOVER_OPORTUNIDADE_ETAPA'; etapaDestinoId: string; motivo?: string }
  | { tipo: 'CRIAR_TAREFA'; titulo: string; descricao?: string; prazoDias?: number; responsavelId?: string };

export type VersaoStatus = 'RASCUNHO' | 'PUBLICADA' | 'ARQUIVADA';

export interface VersaoView {
  id: string;
  numero: number;
  status: VersaoStatus;
  gatilhoTipo: GatilhoTipo;
  condicoes: CondicaoNo;
  acoes: AcaoFluxo[];
  autor: string | null;
  publicadoPor: string | null;
  publicadoEm: string | null;
  arquivadoPor: string | null;
  arquivadoEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface FluxoView {
  id: string;
  nome: string;
  descricao: string | null;
  criadoPor: string | null;
  criadoEm: string;
  atualizadoEm: string;
  versaoPublicada: VersaoView | null;
  versaoRascunho: VersaoView | null;
}

export interface ModeloView {
  id: string;
  nome: string;
  descricao: string | null;
  gatilhoTipo: GatilhoTipo;
  condicoes: CondicaoNo;
  acoes: AcaoFluxo[];
  criadoEm: string;
}

export type ExecucaoResultado = 'EXECUTADA' | 'CONDICAO_NAO_SATISFEITA' | 'FALHOU';

export interface ExecucaoView {
  id: string;
  fluxoVersaoId: string;
  fonte: GatilhoTipo;
  registroTipo: RegistroTipo;
  registroId: string;
  resultado: ExecucaoResultado;
  acoesAplicadas: { tipo: AcaoTipo; status: 'aplicada' | 'falhou'; detalhe?: string }[];
  erroDetalhe: string | null;
  ocorridoEm: string;
  criadoEm: string;
}

export interface SimulacaoResultado {
  gatilhoCompativel: boolean;
  condicaoSatisfeita: boolean;
  acoesQueSeriamDisparadas: AcaoFluxo[];
}

export const workflowApi = {
  async listarFluxos(): Promise<FluxoView[]> {
    const res = await apiFetch('/crm/workflow/fluxos').then(checarOk);
    return (await json<{ itens: FluxoView[] }>(res)).itens;
  },
  async obterFluxo(id: string): Promise<FluxoView> {
    const res = await apiFetch(`/crm/workflow/fluxos/${id}`).then(checarOk);
    return json<FluxoView>(res);
  },
  async criarFluxo(body: {
    nome: string;
    descricao?: string;
    gatilhoTipo: GatilhoTipo;
  }): Promise<FluxoView> {
    const res = await apiFetch('/crm/workflow/fluxos', {
      method: 'POST',
      body: JSON.stringify(body),
    }).then(checarOk);
    return json<FluxoView>(res);
  },
  async substituirRascunho(
    id: string,
    body: { gatilhoTipo: GatilhoTipo; condicoes: CondicaoNo; acoes: AcaoFluxo[] },
  ): Promise<VersaoView> {
    const res = await apiFetch(`/crm/workflow/fluxos/${id}/rascunho`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }).then(checarOk);
    return json<VersaoView>(res);
  },
  async publicar(id: string): Promise<VersaoView> {
    const res = await apiFetch(`/crm/workflow/fluxos/${id}/publicar`, { method: 'POST' }).then(
      checarOk,
    );
    return json<VersaoView>(res);
  },
  async arquivar(id: string): Promise<VersaoView> {
    const res = await apiFetch(`/crm/workflow/fluxos/${id}/arquivar`, { method: 'POST' }).then(
      checarOk,
    );
    return json<VersaoView>(res);
  },
  async listarVersoes(id: string): Promise<VersaoView[]> {
    const res = await apiFetch(`/crm/workflow/fluxos/${id}/versoes`).then(checarOk);
    return (await json<{ itens: VersaoView[] }>(res)).itens;
  },
  async simular(
    id: string,
    body: { registroTipo: RegistroTipo; registroId: string; versaoId?: string },
  ): Promise<SimulacaoResultado> {
    const res = await apiFetch(`/crm/workflow/fluxos/${id}/simular`, {
      method: 'POST',
      body: JSON.stringify(body),
    }).then(checarOk);
    return json<SimulacaoResultado>(res);
  },
  async listarExecucoes(id: string): Promise<ExecucaoView[]> {
    const res = await apiFetch(`/crm/workflow/fluxos/${id}/execucoes`).then(checarOk);
    return (await json<{ itens: ExecucaoView[] }>(res)).itens;
  },
  async listarModelos(): Promise<ModeloView[]> {
    const res = await apiFetch('/crm/workflow/modelos').then(checarOk);
    return (await json<{ itens: ModeloView[] }>(res)).itens;
  },
  async usarComoBase(id: string, body: { nome: string; descricao?: string }): Promise<FluxoView> {
    const res = await apiFetch(`/crm/workflow/modelos/${id}/usar-como-base`, {
      method: 'POST',
      body: JSON.stringify(body),
    }).then(checarOk);
    return json<FluxoView>(res);
  },
  async processar(): Promise<{
    fontesVarridas: string[];
    execucoesCriadas: number;
    execucoesFalharam: number;
  }> {
    const res = await apiFetch('/crm/workflow/processar', { method: 'POST' }).then(checarOk);
    return json(res);
  },
};
