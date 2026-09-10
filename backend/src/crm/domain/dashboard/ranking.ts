/**
 * `combinarRankingComercial` (spec 017, US2 / FR-008 / research.md D-R3) —
 * puro. Junta, por `responsavelId`: oportunidades ganhas + valor ganho (por
 * moeda, **nunca soma moedas** — Padrão Transversal Dinheiro) + taxa de
 * conversão individual + pontos de produtividade de tarefa (016). Ordena por
 * valor ganho total (soma dos `valorInt` **dentro de cada moeda**, comparando
 * pela maior); empate → mais oportunidades ganhas; empate → `responsavelId`.
 */

export interface ValorPorMoeda {
  moeda: string;
  valorInt: string; // bigint serializado
}

export interface GanhasPorResponsavel {
  responsavelId: string;
  ganhas: number;
  perdidas: number;
  valorGanho: ValorPorMoeda[];
}

export interface EntradaRankingComercial {
  responsavelId: string;
  nome: string | null;
  oportunidadesGanhas: number;
  valorGanho: ValorPorMoeda[];
  taxaConversao: number | null;
  pontosTarefa: number;
}

function maiorValorGanho(v: ValorPorMoeda[]): bigint {
  return v.reduce((max, x) => {
    const n = BigInt(x.valorInt);
    return n > max ? n : max;
  }, 0n);
}

export function combinarRankingComercial(
  ganhas: readonly GanhasPorResponsavel[],
  pontosTarefaPorResponsavel: ReadonlyMap<string, number>,
  nomes: ReadonlyMap<string, string>,
): EntradaRankingComercial[] {
  const responsaveis = new Set<string>([
    ...ganhas.map((g) => g.responsavelId),
    ...pontosTarefaPorResponsavel.keys(),
  ]);

  const linhas: EntradaRankingComercial[] = [...responsaveis].map((rid) => {
    const g = ganhas.find((x) => x.responsavelId === rid);
    const totalFechadas = (g?.ganhas ?? 0) + (g?.perdidas ?? 0);
    return {
      responsavelId: rid,
      nome: nomes.get(rid) ?? null,
      oportunidadesGanhas: g?.ganhas ?? 0,
      valorGanho: g?.valorGanho ?? [],
      taxaConversao: totalFechadas === 0 ? null : (g?.ganhas ?? 0) / totalFechadas,
      pontosTarefa: pontosTarefaPorResponsavel.get(rid) ?? 0,
    };
  });

  return linhas.sort((a, b) => {
    const va = maiorValorGanho(a.valorGanho);
    const vb = maiorValorGanho(b.valorGanho);
    if (va !== vb) return va > vb ? -1 : 1;
    if (a.oportunidadesGanhas !== b.oportunidadesGanhas) {
      return b.oportunidadesGanhas - a.oportunidadesGanhas;
    }
    return a.responsavelId < b.responsavelId ? -1 : 1;
  });
}
