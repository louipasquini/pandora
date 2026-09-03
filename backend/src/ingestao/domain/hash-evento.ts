import { createHash } from 'node:crypto';

/**
 * Serializa `valor` de forma **canônica**: chaves de objeto ordenadas
 * recursivamente, sem espaço irrelevante. Determinístico e livre de _locale_.
 * Lança em valor não JSON-serializável (função, `bigint`, símbolo, ciclo).
 */
export function canonicalizar(valor: unknown): string {
  return JSON.stringify(ordenar(valor, new WeakSet<object>()));
}

function ordenar(v: unknown, vistos: WeakSet<object>): unknown {
  if (v === null) return null;
  const t = typeof v;
  if (t === 'bigint' || t === 'function' || t === 'symbol' || t === 'undefined') {
    throw new TypeError(`valor não JSON-serializável no payload: ${t}`);
  }
  if (t !== 'object') return v;
  const obj = v as object;
  if (vistos.has(obj)) throw new TypeError('referência circular no payload');
  vistos.add(obj);
  if (Array.isArray(v)) return v.map((x) => (x === undefined ? null : ordenar(x, vistos)));
  const rec = v as Record<string, unknown>;
  return Object.keys(rec)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      // chaves com valor undefined são omitidas (como faz JSON.stringify)
      if (rec[k] !== undefined) acc[k] = ordenar(rec[k], vistos);
      return acc;
    }, {});
}

/**
 * Impressão digital determinística do `payload_bruto` cru (SHA-256 hex).
 * Compõe, com `(plataforma_origem, id_origem)`, a chave de dedup do event log.
 */
export function hashEvento(payloadBruto: unknown): string {
  return createHash('sha256').update(canonicalizar(payloadBruto)).digest('hex');
}
