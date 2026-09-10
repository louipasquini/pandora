import type { CamposCanonicosHotmart } from './montar';
import {
  dinheiroDeValorHotmart,
  moedaDeHotmart,
  somarDinheiro,
  taxasDe,
  textoOuUndefined,
  type DinheiroCanonicoHotmart,
} from './normalizar-hotmart';

export type Rec = Record<string, unknown>;

export function ehObjeto(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function obj(v: unknown): Rec {
  return ehObjeto(v) ? v : {};
}

function inteiroPositivo(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : Number(textoOuUndefined(v));
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/**
 * Extrai os `CamposCanonicosHotmart` de um item de `GET
 * /payments/api/v1/sales/history` (`{ product, buyer, producer, purchase }`).
 * Puro; nunca lança.
 *
 * `detalhePreco` = o item casado de `GET /sales/price/details` por `transaction`
 * (opcional — H-02/FR-013). Refina `valores.taxas` (`fee + vat`); o resto do
 * detalhe (`coupon`, `base`, `real_conversion_rate`) não tem slot canônico e
 * fica só no `payload_bruto` (feito pelo `parseVendaApi`).
 */
export function camposDeCompraApi(
  item: Rec,
  detalhePreco: Rec | undefined,
  erros: string[],
): CamposCanonicosHotmart {
  const purchase = obj(item.purchase);
  const buyer = obj(item.buyer);
  const product = obj(item.product);
  const price = obj(purchase.price);
  const offer = obj(purchase.offer);
  const hotmartFee = obj(purchase.hotmart_fee);

  const moeda = moedaDeHotmart(price.currency_code);
  if (price.currency_code != null && moeda === undefined) {
    erros.push(
      `purchase.price.currency_code inválida (${JSON.stringify(price.currency_code)}) — assumido BRL`,
    );
  }
  const moedaEfetiva = moeda ?? 'BRL';

  const bruto = dinheiroDeValorHotmart(
    price.value,
    erros,
    'purchase.price.value',
    moedaEfetiva,
  );

  // taxa explícita: `hotmart_fee.total` da própria venda, OU `fee + vat` do detalhe de preço.
  let taxaExplicita: DinheiroCanonicoHotmart | undefined = dinheiroDeValorHotmart(
    hotmartFee.total,
    erros,
    'purchase.hotmart_fee.total',
    moedaDeHotmart(hotmartFee.currency_code) ?? moedaEfetiva,
  );
  if (!taxaExplicita && detalhePreco) {
    const fee = obj(detalhePreco.fee);
    const vat = obj(detalhePreco.vat);
    const feeD = dinheiroDeValorHotmart(
      fee.value,
      erros,
      'price_details.fee.value',
      moedaDeHotmart(fee.currency_code) ?? moedaEfetiva,
    );
    const vatD = dinheiroDeValorHotmart(
      vat.value,
      erros,
      'price_details.vat.value',
      moedaDeHotmart(vat.currency_code) ?? moedaEfetiva,
    );
    taxaExplicita = somarDinheiro(feeD, vatD);
  } else if (taxaExplicita && detalhePreco) {
    // já temos `hotmart_fee.total`; ainda somamos o `vat` do detalhe quando houver.
    const vat = obj(detalhePreco.vat);
    const vatD = dinheiroDeValorHotmart(
      vat.value,
      erros,
      'price_details.vat.value',
      moedaDeHotmart(vat.currency_code) ?? moedaEfetiva,
    );
    taxaExplicita = somarDinheiro(taxaExplicita, vatD);
  }

  const taxas = taxasDe(bruto, undefined, taxaExplicita);
  const liquido =
    bruto && taxas && bruto.moeda === taxas.moeda
      ? { valorInteiro: bruto.valorInteiro - taxas.valorInteiro, moeda: bruto.moeda }
      : undefined;

  const isSub = purchase.is_subscription === true;
  const ciclo = inteiroPositivo(purchase.recurrency_number);

  const email = textoOuUndefined(buyer.email);
  return {
    idOrigem: textoOuUndefined(purchase.transaction),
    statusOrigem: textoOuUndefined(purchase.status) ?? '',
    ocorridoEm:
      textoOuUndefined(purchase.approved_date) ??
      textoOuUndefined(purchase.order_date) ??
      '',
    comprador: {
      nome: textoOuUndefined(buyer.name),
      emails: email ? [email] : undefined,
    },
    valores: { bruto, liquido, taxas },
    oferta: {
      codigoOrigem: textoOuUndefined(offer.code),
      nomeOrigem: textoOuUndefined(offer.name) ?? textoOuUndefined(product.name),
    },
    assinaturaRecorrencia: isSub,
    numeroCiclo: isSub && ciclo && ciclo > 1 ? ciclo : undefined,
    ehAfiliada:
      textoOuUndefined(purchase.commission_as) === 'AFFILIATE' ? true : undefined,
  };
}
