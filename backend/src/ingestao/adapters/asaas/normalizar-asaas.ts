import { Dinheiro } from '../../../core/core.module';

/**
 * Helpers **puros** de normalização da borda Asaas (spec 020). Sem banco, sem
 * locale, sem `Date`. A conversão de dinheiro passa pelo `Dinheiro.deDecimal` do
 * `core` (escala ×10000, sem `float`, sem `parseFloat`). Cópia estrutural do
 * `normalizar-tmb.ts` da spec 019.
 */

/** `"  "` / `""` / `null` / `undefined` → `undefined`; senão `String(v).trim()`. */
export function textoOuUndefined(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

/** Só os dígitos de uma string (CPF/CNPJ crus). `""` se não houver nenhum. */
export function soDigitos(v: unknown): string {
  if (v == null) return '';
  return String(v).replace(/\D+/g, '');
}

/**
 * Junta N campos de telefone, divide por `,` `;` ou espaço, tira vazios e
 * deduplica preservando a 1ª ocorrência.
 */
export function telefonesDeString(
  ...partes: Array<string | number | null | undefined>
): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const parte of partes) {
    if (parte == null) continue;
    for (const bruto of String(parte).split(/[,;\s]+/)) {
      const t = bruto.trim();
      if (t === '' || vistos.has(t)) continue;
      vistos.add(t);
      out.push(t);
    }
  }
  return out;
}

/** Forma que o `eventoCanonicoSchema` aceita para um `Dinheiro` (transporta bigint). */
export interface DinheiroCanonicoAsaas {
  valorInteiro: bigint;
  moeda: string;
}

/**
 * Converte um valor monetário cru da Asaas (número JSON `197`, `"250.00"`,
 * `89.9`, …) para a forma canônica `{ valorInteiro: bigint ×10000, moeda }`.
 *
 * A Asaas opera 100% em BRL (gateway de cobrança brasileiro — visão Apêndice A):
 * `moeda` default explícito na borda. `null`/`''`/não-numérico/negativo →
 * `undefined` + motivo no `erros` de quem chamou. `float` nunca sai daqui.
 */
export function dinheiroDeValorAsaas(
  v: unknown,
  erros: string[],
  rotulo: string,
  moeda = 'BRL',
): DinheiroCanonicoAsaas | undefined {
  if (v == null || v === '') return undefined;

  let texto: string;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) {
      erros.push(`${rotulo}: valor não-finito (${JSON.stringify(v)})`);
      return undefined;
    }
    texto = String(v);
  } else if (typeof v === 'string') {
    texto = v.trim();
  } else {
    erros.push(`${rotulo}: tipo de valor inesperado (${typeof v})`);
    return undefined;
  }

  // Notação científica ou separador de milhar → não tentamos adivinhar.
  if (!/^-?\d+(\.\d+)?$/.test(texto)) {
    erros.push(`${rotulo}: formato de valor não reconhecido (${JSON.stringify(texto)})`);
    return undefined;
  }

  // `Dinheiro.deDecimal` aceita no máximo 4 casas — trunca o excesso por string.
  const ponto = texto.indexOf('.');
  if (ponto >= 0 && texto.length - ponto - 1 > 4) {
    texto = texto.slice(0, ponto + 5);
  }

  try {
    const d = Dinheiro.deDecimal(texto, moeda);
    if (d.valorInt < 0n) {
      erros.push(`${rotulo}: valor negativo (${JSON.stringify(texto)})`);
      return undefined;
    }
    return { valorInteiro: d.valorInt, moeda: d.moeda };
  } catch (e) {
    erros.push(`${rotulo}: ${(e as Error).message}`);
    return undefined;
  }
}

/**
 * `bruto − liquido`, só se `0 < resultado < bruto` (guarda de sanidade). A Asaas
 * entrega `netValue` direto; a "taxa" (`value − netValue`) é o campo derivado.
 */
export function taxasDe(
  bruto: DinheiroCanonicoAsaas | undefined,
  liquido: DinheiroCanonicoAsaas | undefined,
): DinheiroCanonicoAsaas | undefined {
  if (!bruto || !liquido || bruto.moeda !== liquido.moeda) return undefined;
  const taxa = bruto.valorInteiro - liquido.valorInteiro;
  if (taxa <= 0n || taxa >= bruto.valorInteiro) return undefined;
  return { valorInteiro: taxa, moeda: bruto.moeda };
}
