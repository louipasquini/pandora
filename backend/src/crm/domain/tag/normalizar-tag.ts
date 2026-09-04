/**
 * Normalização de `tag` (spec 009) — fonte única do slug, compartilhada por
 * lead, pessoa e interação. Puro, livre de locale, nunca lança.
 *
 * A spec 008 tinha esta mesma regra embutida em `domain/lead/normalizar-lead.ts`
 * (com `lead.tags: String[]`); esta spec promove `tag` a entidade de 1ª classe
 * (CL-04) e centraliza a normalização aqui — `normalizar-lead.ts` passa a
 * **importar** deste módulo em vez de duplicar a regra (research.md §4).
 */

export type Norm<T = string> =
  | { valor: T; erro?: undefined }
  | { valor?: undefined; erro: string };

/** Tag: `trim` + `lowercase` + espaço interno → `-`. Vazia após normalizar → erro. */
export function normalizarTag(bruto: string | null | undefined): Norm {
  const v = (bruto ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '');
  if (!v) return { erro: 'tag vazia após normalizar' };
  if (v.length > 60) return { erro: 'tag acima de 60 caracteres' };
  return { valor: v };
}

/** Normaliza e deduplica uma lista de tags; propaga o 1º erro encontrado. */
export function normalizarTags(brutas: readonly string[] | undefined): Norm<string[]> {
  const out: string[] = [];
  for (const t of brutas ?? []) {
    const r = normalizarTag(t);
    if (r.erro !== undefined) return { erro: r.erro };
    if (!out.includes(r.valor)) out.push(r.valor);
  }
  return { valor: out };
}
