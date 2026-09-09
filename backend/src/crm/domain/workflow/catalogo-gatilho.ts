import type { FluxoGatilhoTipo } from '@prisma/client';
import type { AcaoTipo } from './tipos';

export interface CampoCondicao {
  campo: string;
  tipo: 'texto' | 'numero' | 'booleano' | 'lista';
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

const ACOES_LEAD: readonly AcaoTipo[] = [
  'MOVER_LEAD_ESTAGIO',
  'APLICAR_TAG',
  'REMOVER_TAG',
  'REGISTRAR_NOTA',
  'CRIAR_TAREFA',
];

const ACOES_OPORTUNIDADE: readonly AcaoTipo[] = ['MOVER_OPORTUNIDADE_ETAPA', 'CRIAR_TAREFA'];

const TODAS_ACOES: readonly AcaoTipo[] = [
  'MOVER_LEAD_ESTAGIO',
  'APLICAR_TAG',
  'REMOVER_TAG',
  'REGISTRAR_NOTA',
  'MOVER_OPORTUNIDADE_ETAPA',
  'CRIAR_TAREFA',
];

/**
 * Catálogo fechado de campos de condição por gatilho (research.md D-R3).
 * `EVENTO_EXTERNO` não tem contexto real (nunca executa, CL-01) — devolve
 * lista vazia (nenhuma condição é avaliável de fato).
 */
export function camposDoGatilho(tipo: FluxoGatilhoTipo): readonly CampoCondicao[] {
  if (tipo === 'OPORTUNIDADE_ETAPA_MUDOU') return CAMPOS_OPORTUNIDADE;
  if (tipo === 'EVENTO_EXTERNO') return [];
  return CAMPOS_LEAD;
}

/**
 * Ações compatíveis com o gatilho (D-R4/contracts/workflow.md).
 * `EVENTO_EXTERNO` aceita o catálogo inteiro — nunca executa de qualquer
 * forma, então não há necessidade de restringir (CL-01).
 */
export function acoesCompativeis(tipo: FluxoGatilhoTipo): readonly AcaoTipo[] {
  if (tipo === 'OPORTUNIDADE_ETAPA_MUDOU') return ACOES_OPORTUNIDADE;
  if (tipo === 'EVENTO_EXTERNO') return TODAS_ACOES;
  return ACOES_LEAD;
}
