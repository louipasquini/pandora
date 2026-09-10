import { Dinheiro } from '../../../core/core.module';

/**
 * Helpers **puros** de normalização da borda TMB (spec 019). Sem banco, sem
 * locale, sem `Date`. A conversão de dinheiro passa pelo `Dinheiro.deDecimal` do
 * `core` (escala ×10000, sem `float`, sem `parseFloat`).
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
 * Junta N campos de telefone que a TMB manda achatados (`"+5511..., 11..."`,
 * `telefone_ativo`, …), divide por `,` `;` ou espaço, tira vazios e deduplica
 * preservando a 1ª ocorrência.
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

export interface EnderecoTmb {
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
export function enderecoDeTmb(campos: EnderecoTmb): EnderecoTmb | undefined {
  const e: EnderecoTmb = {};
  for (const [k, v] of Object.entries(campos) as [keyof EnderecoTmb, unknown][]) {
    const s = textoOuUndefined(v);
    if (s !== undefined) e[k] = s;
  }
  return Object.keys(e).length === 0 ? undefined : e;
}

/** Forma que o `eventoCanonicoSchema` aceita para um `Dinheiro` (transporta bigint). */
export interface DinheiroCanonicoTmb {
  valorInteiro: bigint;
  moeda: string;
}

/**
 * Converte um valor monetário cru da TMB (número JSON `299.99`, `"1250"`,
 * `1250.0000`, …) para a forma canônica `{ valorInteiro: bigint ×10000, moeda }`.
 *
 * A TMB não expõe moeda (opera 100% em BRL — visão Apêndice A): `moeda` default
 * explícito na borda. `null`/`''`/não-numérico/negativo → `undefined` + motivo no
 * `erros` de quem chamou. `float` nunca sai daqui.
 */
export function dinheiroDeValorTmb(
  v: unknown,
  erros: string[],
  rotulo: string,
  moeda = 'BRL',
): DinheiroCanonicoTmb | undefined {
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

/** `bruto − taxas`, só se `0 < resultado < bruto` (guarda de sanidade — D-R8). */
export function liquidoDe(
  bruto: DinheiroCanonicoTmb | undefined,
  taxas: DinheiroCanonicoTmb | undefined,
): DinheiroCanonicoTmb | undefined {
  if (!bruto || !taxas || bruto.moeda !== taxas.moeda) return undefined;
  const liq = bruto.valorInteiro - taxas.valorInteiro;
  if (liq <= 0n || liq >= bruto.valorInteiro) return undefined;
  return { valorInteiro: liq, moeda: bruto.moeda };
}
