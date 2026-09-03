/**
 * `Moeda` — código de moeda ISO 4217 (alfabético, 3 letras, caixa alta).
 *
 * Decisão do dono do produto (spec 002 §Clarifications): conjunto **aberto porém
 * validado**. Não travamos numa lista curta que a 1ª venda internacional
 * quebraria, mas um código fora da ISO 4217 é rejeitado — moeda desconhecida
 * vinda de origem vira evento a revisar, nunca valor aceito (coerente com o
 * tratamento de status). `moeda` nunca é opcional em `Dinheiro`.
 *
 * A lista abaixo são os códigos de moeda **corrente** ativos da ISO 4217
 * (tabela A.1). Ficam de fora, de propósito: metais preciosos (XAU, XAG, XPD,
 * XPT), unidades supranacionais / de fundo (XDR, XBA–XBD, XSU, XUA), códigos de
 * teste/ausência (XTS, XXX) e os "fund codes" espelho (BOV, CHE, CHW, CLF, COU,
 * MXV, USN, UYI, UYW). Se um adapter precisar de um desses, é adição pontual
 * aqui — nunca uma string livre no domínio.
 */

const ISO_4217_ATIVAS = [
  'AED', 'AFN', 'ALL', 'AMD', 'ANG', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN',
  'BAM', 'BBD', 'BDT', 'BGN', 'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BRL',
  'BSD', 'BTN', 'BWP', 'BYN', 'BZD', 'CAD', 'CDF', 'CHF', 'CLP', 'CNY',
  'COP', 'CRC', 'CUP', 'CVE', 'CZK', 'DJF', 'DKK', 'DOP', 'DZD', 'EGP',
  'ERN', 'ETB', 'EUR', 'FJD', 'FKP', 'GBP', 'GEL', 'GHS', 'GIP', 'GMD',
  'GNF', 'GTQ', 'GYD', 'HKD', 'HNL', 'HTG', 'HUF', 'IDR', 'ILS', 'INR',
  'IQD', 'IRR', 'ISK', 'JMD', 'JOD', 'JPY', 'KES', 'KGS', 'KHR', 'KMF',
  'KPW', 'KRW', 'KWD', 'KYD', 'KZT', 'LAK', 'LBP', 'LKR', 'LRD', 'LSL',
  'LYD', 'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR',
  'MVR', 'MWK', 'MXN', 'MYR', 'MZN', 'NAD', 'NGN', 'NIO', 'NOK', 'NPR',
  'NZD', 'OMR', 'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'PYG', 'QAR',
  'RON', 'RSD', 'RUB', 'RWF', 'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD',
  'SHP', 'SLE', 'SOS', 'SRD', 'SSP', 'STN', 'SVC', 'SYP', 'SZL', 'THB',
  'TJS', 'TMT', 'TND', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH', 'UGX',
  'USD', 'UYU', 'UZS', 'VED', 'VES', 'VND', 'VUV', 'WST', 'XAF', 'XCD',
  'XCG', 'XOF', 'XPF', 'YER', 'ZAR', 'ZMW', 'ZWG',
] as const;

/** Códigos ISO 4217 (moeda corrente) aceitos, na ordem canônica. Imutável. */
export const ISO_4217: readonly string[] = Object.freeze([...ISO_4217_ATIVAS]);

/** Índice para checagem O(1). */
export const ISO_4217_SET: ReadonlySet<string> = new Set(ISO_4217_ATIVAS);

/**
 * String de 3 letras que é um código ISO 4217 conhecido. Tipo "branded": só o
 * `assertMoeda` / `criarMoeda` deste módulo produz um valor `Moeda`, então o
 * compilador garante que toda `Moeda` já foi validada.
 */
export type Moeda = string & { readonly __brand: 'Moeda' };

/** `true` sse `v` é uma string que, em caixa alta, é um código ISO 4217 aceito. */
export function ehMoeda(v: unknown): v is Moeda {
  return typeof v === 'string' && ISO_4217_SET.has(v.toUpperCase());
}

/**
 * Garante que `v` é uma `Moeda`. Normaliza para caixa alta na verificação.
 * Inválido → `RangeError` nomeando o valor recebido.
 */
export function assertMoeda(v: unknown): asserts v is Moeda {
  if (typeof v !== 'string' || !ISO_4217_SET.has(v.toUpperCase())) {
    throw new RangeError(`Moeda não é um código ISO 4217 válido: ${JSON.stringify(v)}`);
  }
}

/** Valida e devolve `v` normalizado para caixa alta como `Moeda`. */
export function criarMoeda(v: string): Moeda {
  assertMoeda(v);
  return v.toUpperCase() as Moeda;
}
