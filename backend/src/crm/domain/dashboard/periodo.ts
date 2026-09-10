/**
 * `resolverPeriodo` (spec 017, FR-003 / FR-018 / D-05 / research.md D-R4/D-R5)
 * — puro, determinístico. `de`/`ate` nascem de um seletor de data do painel
 * (não de payload de origem), então usa `Date`/ISO simples — **não** o
 * `parseInstante` de borda do core. Lixo → `throw` (o controller converte em
 * 400).
 *
 * `ate` sem componente de hora é empurrado para o fim do dia (23:59:59.999),
 * para o intervalo ser inclusivo do dia escolhido.
 */

export type BucketSerie = 'dia' | 'semana' | 'mes';

export interface PeriodoResolvido {
  de: Date;
  ate: Date;
  anteriorDe: Date;
  anteriorAte: Date;
  duracaoDias: number;
  bucket: BucketSerie;
}

const SO_DATA = /^\d{4}-\d{2}-\d{2}$/;

function parseData(valor: string, fimDoDia: boolean): Date {
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw new Error('data ausente');
  }
  const bruto = valor.trim();
  const iso = SO_DATA.test(bruto)
    ? `${bruto}T${fimDoDia ? '23:59:59.999' : '00:00:00.000'}Z`
    : bruto;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`data inválida: ${JSON.stringify(valor)}`);
  }
  return d;
}

function bucketDe(duracaoDias: number): BucketSerie {
  if (duracaoDias <= 62) return 'dia';
  if (duracaoDias <= 366) return 'semana';
  return 'mes';
}

export function resolverPeriodo(deISO: string, ateISO: string): PeriodoResolvido {
  const de = parseData(deISO, false);
  const ate = parseData(ateISO, true);
  if (de.getTime() > ate.getTime()) {
    throw new Error('`de` não pode ser depois de `ate`');
  }

  const spanMs = ate.getTime() - de.getTime();
  const duracaoDias = Math.max(1, Math.round(spanMs / 86_400_000));

  // Período anterior: mesma duração, imediatamente antes de `de`.
  const anteriorAte = new Date(de.getTime() - 1);
  const anteriorDe = new Date(anteriorAte.getTime() - spanMs);

  return { de, ate, anteriorDe, anteriorAte, duracaoDias, bucket: bucketDe(duracaoDias) };
}
