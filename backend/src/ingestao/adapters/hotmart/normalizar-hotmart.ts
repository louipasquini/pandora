import { Dinheiro, ehMoeda } from '../../../core/core.module';

/**
 * Helpers **puros** de normalização da borda Hotmart (spec 022). Sem banco, sem
 * locale, sem `Date`. A conversão de dinheiro passa pelo `Dinheiro.deDecimal` do
 * `core` (escala ×10000, sem `float`, sem `parseFloat`). Cópia estrutural do
 * `normalizar-guru.ts` (spec 021), com a **moeda parametrizada** — a Hotmart
 * sempre expõe a moeda (`price.currency_code` / `.currency_value` / coluna).
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
 * Junta N campos de telefone (código de área + número, na Hotmart), divide por
 * `,` `;` ou espaço, tira vazios e deduplica preservando a 1ª ocorrência.
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

export interface EnderecoHotmart {
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  pais?: string;
}

/** Monta o bloco de endereço só com as chaves não-vazias; tudo vazio → `undefined`. */
export function enderecoDeHotmart(
  campos: EnderecoHotmart,
): EnderecoHotmart | undefined {
  const e: EnderecoHotmart = {};
  for (const [k, v] of Object.entries(campos) as [keyof EnderecoHotmart, unknown][]) {
    const s = textoOuUndefined(v);
    if (s !== undefined) e[k] = s;
  }
  return Object.keys(e).length === 0 ? undefined : e;
}

/** Moeda crua → código ISO 4217 validado, ou `undefined` (a borda usa `BRL`). */
export function moedaDeHotmart(v: unknown): string | undefined {
  const s = textoOuUndefined(v);
  if (s === undefined) return undefined;
  const cod = s.toUpperCase();
  return ehMoeda(cod) ? cod : undefined;
}

/** Forma que o `eventoCanonicoSchema` aceita para um `Dinheiro` (transporta bigint). */
export interface DinheiroCanonicoHotmart {
  valorInteiro: bigint;
  moeda: string;
}

/**
 * Converte um valor monetário cru da Hotmart (número JSON `150.6`, `"134"`, …)
 * para a forma canônica `{ valorInteiro: bigint ×10000, moeda }`.
 *
 * A `moeda` vem de `price.currency_code`/`.currency_value`/coluna (repassada por
 * quem chama); ausente/inválida → `"BRL"` cravado na borda (Padrão Transversal
 * "Dinheiro", `moeda` nunca opcional). `null`/`''`/não-numérico/negativo/notação
 * científica → `undefined` + motivo no `erros` de quem chamou. `float` nunca sai
 * daqui.
 */
export function dinheiroDeValorHotmart(
  v: unknown,
  erros: string[],
  rotulo: string,
  moeda = 'BRL',
): DinheiroCanonicoHotmart | undefined {
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
 * "Taxa" da venda: a taxa explícita (`hotmart_fee.total`, ou `fee + vat` do
 * detalhe de preço) quando faz sentido, senão `bruto − liquido`. Guarda de
 * sanidade em ambos: só devolve se `0 < taxa < bruto` e mesma moeda.
 */
export function taxasDe(
  bruto: DinheiroCanonicoHotmart | undefined,
  liquido: DinheiroCanonicoHotmart | undefined,
  taxaExplicita: DinheiroCanonicoHotmart | undefined,
): DinheiroCanonicoHotmart | undefined {
  if (bruto && taxaExplicita && bruto.moeda === taxaExplicita.moeda) {
    const t = taxaExplicita.valorInteiro;
    if (t > 0n && t < bruto.valorInteiro) return taxaExplicita;
  }
  if (bruto && liquido && bruto.moeda === liquido.moeda) {
    const t = bruto.valorInteiro - liquido.valorInteiro;
    if (t > 0n && t < bruto.valorInteiro) return { valorInteiro: t, moeda: bruto.moeda };
  }
  return undefined;
}

/** Soma 2 valores canônicos de mesma moeda (para `fee + vat` do detalhe de preço). */
export function somarDinheiro(
  a: DinheiroCanonicoHotmart | undefined,
  b: DinheiroCanonicoHotmart | undefined,
): DinheiroCanonicoHotmart | undefined {
  if (a && b && a.moeda === b.moeda) {
    return { valorInteiro: a.valorInteiro + b.valorInteiro, moeda: a.moeda };
  }
  return a ?? b ?? undefined;
}
