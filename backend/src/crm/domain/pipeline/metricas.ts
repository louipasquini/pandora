import type { TipoEtapa } from './movimentacao';

/**
 * Métricas derivadas do pipeline (spec 010, D-04/FR-021) — puro. Recebe o
 * resultado já agregado por banco (`groupBy` por `[etapaId, moeda]`) e monta
 * a resposta; nunca soma entre moedas (Padrão Transversal Dinheiro).
 */

export interface EtapaInfo {
  id: string;
  nome: string;
  tipo: TipoEtapa;
}

export interface LinhaGroupBy {
  etapaId: string;
  moeda: string;
  quantidade: number;
  somaValorInt: bigint;
}

export interface TempoMedioEtapa {
  etapaId: string;
  horas: number;
}

export interface MetricaEtapa {
  etapaId: string;
  nome: string;
  tipo: TipoEtapa;
  quantidade: number;
  valorEstimado: { valorInt: string; moeda: string }[];
  tempoMedioHoras: number | null;
}

export interface Metricas {
  porEtapa: MetricaEtapa[];
  taxaConversao: number | null;
}

export function agregarMetricas(
  etapas: readonly EtapaInfo[],
  linhasGroupBy: readonly LinhaGroupBy[],
  tempoMedioPorEtapa: readonly TempoMedioEtapa[],
): Metricas {
  const tempoMedioMap = new Map(tempoMedioPorEtapa.map((t) => [t.etapaId, t.horas]));

  const porEtapa: MetricaEtapa[] = etapas.map((etapa) => {
    const linhas = linhasGroupBy.filter((l) => l.etapaId === etapa.id);
    const quantidade = linhas.reduce((acc, l) => acc + l.quantidade, 0);
    return {
      etapaId: etapa.id,
      nome: etapa.nome,
      tipo: etapa.tipo,
      quantidade,
      valorEstimado: linhas.map((l) => ({
        valorInt: l.somaValorInt.toString(),
        moeda: l.moeda,
      })),
      tempoMedioHoras: etapa.tipo === 'ABERTA' ? (tempoMedioMap.get(etapa.id) ?? null) : null,
    };
  });

  const ganhas = porEtapa
    .filter((e) => e.tipo === 'GANHA')
    .reduce((acc, e) => acc + e.quantidade, 0);
  const perdidas = porEtapa
    .filter((e) => e.tipo === 'PERDIDA')
    .reduce((acc, e) => acc + e.quantidade, 0);
  const denominador = ganhas + perdidas;

  return {
    porEtapa,
    taxaConversao: denominador === 0 ? null : ganhas / denominador,
  };
}
