import { Dinheiro, ehMoeda } from '../../../core/core.module';

/**
 * Helpers **puros** de normalização da borda Guru (spec 021). Sem banco, sem
 * locale, sem `Date`. A conversão de dinheiro passa pelo `Dinheiro.deDecimal` do
 * `core` (escala ×10000, sem `float`, sem `parseFloat`). Cópia estrutural do
 * `normalizar-asaas.ts` da spec 020, com a **moeda parametrizada** — a Guru
 * expõe `payment.currency` (ISO 4217).
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
 * Junta N campos de telefone (código local + número, na Guru), divide por `,`
 * `;` ou espaço, tira vazios e deduplica preservando a 1ª ocorrência.
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

export interface EnderecoGuru {
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
export function enderecoDeGuru(campos: EnderecoGuru): EnderecoGuru | undefined {
  const e: EnderecoGuru = {};
  for (const [k, v] of Object.entries(campos) as [keyof EnderecoGuru, unknown][]) {
    const s = textoOuUndefined(v);
    if (s !== undefined) e[k] = s;
  }
  return Object.keys(e).length === 0 ? undefined : e;
}

/** `payment.currency` cru → código ISO 4217 validado, ou `undefined` (a borda usa `BRL`). */
export function moedaDeGuru(v: unknown): string | undefined {
  const s = textoOuUndefined(v);
  if (s === undefined) return undefined;
  const cod = s.toUpperCase();
  return ehMoeda(cod) ? cod : undefined;
}

/** Forma que o `eventoCanonicoSchema` aceita para um `Dinheiro` (transporta bigint). */
export interface DinheiroCanonicoGuru {
  valorInteiro: bigint;
  moeda: string;
}

/**
 * Converte um valor monetário cru da Guru (número JSON `497`, `"19.90"`,
 * `468.1`, …) para a forma canônica `{ valorInteiro: bigint ×10000, moeda }`.
 *
 * A `moeda` vem de `payment.currency` (repassada por quem chama); ausente/inválida
 * → `"BRL"` cravado na borda (Padrão Transversal "Dinheiro", `moeda` nunca
 * opcional). `null`/`''`/não-numérico/negativo/notação científica → `undefined` +
 * motivo no `erros` de quem chamou. `float` nunca sai daqui.
 */
export function dinheiroDeValorGuru(
  v: unknown,
  erros: string[],
  rotulo: string,
  moeda = 'BRL',
): DinheiroCanonicoGuru | undefined {
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
 * "Taxa" da venda: `payment.tax.value` quando faz sentido, senão `bruto − liquido`.
 * Guarda de sanidade em ambos: só devolve se `0 < taxa < bruto` e mesma moeda.
 */
export function taxasDe(
  bruto: DinheiroCanonicoGuru | undefined,
  liquido: DinheiroCanonicoGuru | undefined,
  taxaExplicita: DinheiroCanonicoGuru | undefined,
): DinheiroCanonicoGuru | undefined {
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
