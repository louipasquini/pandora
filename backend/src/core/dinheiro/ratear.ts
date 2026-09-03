import { Dinheiro } from './dinheiro';

/**
 * Divisão de `Dinheiro` — a **única** via de "dividir dinheiro" no `core`
 * (não existe `Dinheiro.dividir`).
 *
 * Garantia comum a `ratear` e `ratearPorPesos`: a soma das partes é **exatamente**
 * igual ao total original — nenhuma unidade da escala ×10000 é perdida nem criada.
 * O resto é distribuído de forma determinística (maior-resto / Hamilton).
 */

/** Divide `total` em `n` partes o mais iguais possível. `n` inteiro > 0. */
export function ratear(total: Dinheiro, n: number): Dinheiro[] {
  if (!Number.isInteger(n) || n <= 0) {
    throw new RangeError(`ratear: n deve ser inteiro > 0, recebido ${JSON.stringify(n)}`);
  }
  const N = BigInt(n);
  const base = total.valorInt / N;
  const resto = total.valorInt % N; // mesmo sinal do total
  const passo = resto < 0n ? -1n : 1n;
  const comExtra = resto < 0n ? -resto : resto;

  const partes: Dinheiro[] = [];
  for (let i = 0n; i < N; i++) {
    const valor = base + (i < comExtra ? passo : 0n);
    partes.push(Dinheiro.deInteiroEscalado(valor, total.moeda));
  }
  return partes;
}

/**
 * Divide `total` proporcionalmente a `pesos` (inteiros >= 0, soma > 0).
 * O resto vai para as partes de maior fração residual (maior-resto).
 */
export function ratearPorPesos(total: Dinheiro, pesos: number[]): Dinheiro[] {
  if (
    !Array.isArray(pesos) ||
    pesos.length === 0 ||
    pesos.some((p) => !Number.isInteger(p) || p < 0)
  ) {
    throw new RangeError(
      `ratearPorPesos: pesos deve ser array não vazio de inteiros >= 0, recebido ${JSON.stringify(pesos)}`,
    );
  }
  const somaPesos = pesos.reduce((a, b) => a + b, 0);
  if (somaPesos <= 0) {
    throw new RangeError('ratearPorPesos: soma dos pesos deve ser > 0');
  }

  const v = total.valorInt;
  const S = BigInt(somaPesos);
  const bases: bigint[] = [];
  const restos: bigint[] = [];
  for (const p of pesos) {
    const ideal = v * BigInt(p);
    bases.push(ideal / S);
    restos.push(ideal % S);
  }

  const atribuido = bases.reduce((a, b) => a + b, 0n);
  const diff = v - atribuido; // |diff| < pesos.length
  const passo = diff < 0n ? -1n : 1n;
  const faltam = Number(diff < 0n ? -diff : diff);

  const ordem = pesos
    .map((_p, i) => i)
    .filter((i) => pesos[i] > 0)
    .sort((a, b) => {
      if (restos[a] !== restos[b]) {
        return passo > 0n
          ? restos[b] > restos[a]
            ? 1
            : -1
          : restos[a] > restos[b]
            ? 1
            : -1;
      }
      if (pesos[a] !== pesos[b]) return pesos[b] - pesos[a];
      return a - b;
    });

  const resultado = bases.slice();
  for (let k = 0; k < faltam; k++) {
    resultado[ordem[k % ordem.length]] += passo;
  }
  return resultado.map((valor) => Dinheiro.deInteiroEscalado(valor, total.moeda));
}
