/**
 * `parseInstante` — parser de borda tolerante de data/hora (Padrão Transversal
 * "Tempo" da constituição).
 *
 * Contrato (spec 002, `contracts/tempo.md`):
 * - **Nunca lança.** Retorna `{ valor: Date | null, motivo?: string }`.
 * - `valor` é sempre um instante absoluto (equivalente a `timestamptz` UTC) ou `null`.
 * - `motivo` está presente sempre que `valor === null` **ou** houve suposição
 *   (string sem fuso → assumida UTC).
 * - **Livre de locale/timezone** da máquina: só usa `new Date(<ISO com Z/offset>)`
 *   e `new Date(<epoch ms>)`, nunca `new Date(ano, mês, ...)` nem `Date.parse` de
 *   formato ambíguo.
 * - Formatos de planilha/locale (`dd/mm/aaaa`, serial de Excel) → `null` + motivo.
 *   Normalizá-los é responsabilidade do adapter de CSV (specs 019–022, 028).
 */

export interface ResultadoInstante {
  valor: Date | null;
  motivo?: string;
}

/**
 * Limiar de escala epoch: `|n| < 1e11` ⇒ segundos; senão milissegundos.
 * `1e11` s ≈ ano 5138; `1e11` ms ≈ 1973-03 — qualquer data de negócio (1973…)
 * em ms fica ≥ `1e11` e em s fica `< 1e11`. Sem zona cinzenta plausível.
 */
const LIMIAR_EPOCH_MS = 1e11;

const SO_DIGITOS_RE = /^-?\d+$/;
const ISO_COM_FUSO_RE =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|z|[+-]\d{2}:?\d{2})$/;
const ISO_SEM_FUSO_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?$/;

export function parseInstante(entrada: unknown): ResultadoInstante {
  if (entrada instanceof Date) {
    return Number.isNaN(entrada.getTime())
      ? { valor: null, motivo: 'Date inválido (NaN)' }
      : { valor: new Date(entrada.getTime()) };
  }

  if (typeof entrada === 'number') {
    return numeroParaInstante(entrada, `número ${entrada}`);
  }

  if (typeof entrada === 'string') {
    const s = entrada.trim();
    if (s === '') return { valor: null, motivo: 'string vazia' };

    if (SO_DIGITOS_RE.test(s)) {
      return numeroParaInstante(Number(s), `string numérica ${JSON.stringify(entrada)}`);
    }

    if (ISO_COM_FUSO_RE.test(s)) {
      const d = new Date(s.replace(' ', 'T'));
      return Number.isNaN(d.getTime())
        ? { valor: null, motivo: `ISO com fuso inválida: ${JSON.stringify(entrada)}` }
        : { valor: d };
    }

    if (ISO_SEM_FUSO_RE.test(s)) {
      const iso = s.replace(' ', 'T');
      const comZ = iso.length === 10 ? `${iso}T00:00:00Z` : `${iso}Z`;
      const d = new Date(comZ);
      return Number.isNaN(d.getTime())
        ? { valor: null, motivo: `data inválida: ${JSON.stringify(entrada)}` }
        : { valor: d, motivo: 'sem fuso — assumido UTC' };
    }

    return {
      valor: null,
      motivo: `formato não reconhecido; normalize no adapter: ${JSON.stringify(entrada)}`,
    };
  }

  return {
    valor: null,
    motivo: `tipo não suportado: ${entrada === null ? 'null' : typeof entrada}`,
  };
}

function numeroParaInstante(n: number, ctx: string): ResultadoInstante {
  if (!Number.isFinite(n)) {
    return { valor: null, motivo: `${ctx}: não finito` };
  }
  const ms = Math.abs(n) < LIMIAR_EPOCH_MS ? n * 1000 : n;
  const d = new Date(ms);
  return Number.isNaN(d.getTime())
    ? { valor: null, motivo: `${ctx}: epoch fora de faixa` }
    : { valor: d };
}
