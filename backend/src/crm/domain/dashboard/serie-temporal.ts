import type { BucketSerie } from './periodo';

/**
 * Agrupamento de série temporal em buckets (spec 017, FR-018 / research.md
 * D-R5) — puro, livre de locale: o rótulo do bucket é o dia/semana/mês civil
 * em America/Sao_Paulo via `Intl` nativo (0 dependência, mesmo padrão de
 * `calcularEstadoPrazo`, 016 / `estaEmExpediente`, 007).
 */

const FUSO = 'America/Sao_Paulo';

const FMT_DIA = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export interface PontoDatado {
  quando: Date;
  valor: number;
}

export interface PontoSerie {
  rotulo: string;
  valor: number;
}

function diaLocal(d: Date): string {
  return FMT_DIA.format(d);
}

/** Segunda-feira da semana ISO do dia local (rótulo `YYYY-MM-DD`). */
function semanaLocal(d: Date): string {
  const [ano, mes, dia] = diaLocal(d).split('-').map(Number);
  const base = new Date(Date.UTC(ano, mes - 1, dia));
  const dow = (base.getUTCDay() + 6) % 7; // 0 = segunda
  base.setUTCDate(base.getUTCDate() - dow);
  return base.toISOString().slice(0, 10);
}

function mesLocal(d: Date): string {
  return diaLocal(d).slice(0, 7); // YYYY-MM
}

export function rotuloBucket(d: Date, bucket: BucketSerie): string {
  if (bucket === 'dia') return diaLocal(d);
  if (bucket === 'semana') return semanaLocal(d);
  return mesLocal(d);
}

export function agruparEmBuckets(
  pontos: readonly PontoDatado[],
  bucket: BucketSerie,
): PontoSerie[] {
  const soma = new Map<string, number>();
  for (const p of pontos) {
    const rotulo = rotuloBucket(p.quando, bucket);
    soma.set(rotulo, (soma.get(rotulo) ?? 0) + p.valor);
  }
  return [...soma.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([rotulo, valor]) => ({ rotulo, valor }));
}
