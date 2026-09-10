import type { CamposCanonicosHotmart } from './montar';
import { obj, type Rec } from './compra';
import {
  dinheiroDeValorHotmart,
  enderecoDeHotmart,
  moedaDeHotmart,
  soDigitos,
  taxasDe,
  telefonesDeString,
  textoOuUndefined,
} from './normalizar-hotmart';

function inteiroPositivo(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : Number(textoOuUndefined(v));
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/**
 * Extrai os `CamposCanonicosHotmart` do `data` de um webhook `PURCHASE_*` da
 * Hotmart (`{ product, buyer, producer, commissions, purchase, subscription,
 * affiliates }`). Puro; nunca lança.
 *
 * Fonte de status = `data.purchase.status` (**não** o `event` do envelope). O
 * comprador do webhook é **rico** (documento + telefone + endereço), diferente do
 * `sales/history` (só nome + e-mail).
 */
export function camposDeCompraWebhook(
  data: Rec,
  erros: string[],
): CamposCanonicosHotmart {
  const purchase = obj(data.purchase);
  const buyer = obj(data.buyer);
  const product = obj(data.product);
  const subscription = obj(data.subscription);
  const price = obj(purchase.price);
  const offer = obj(purchase.offer);
  const address = obj(buyer.address);

  const moeda = moedaDeHotmart(price.currency_value);
  if (price.currency_value != null && moeda === undefined) {
    erros.push(
      `data.purchase.price.currency_value inválida (${JSON.stringify(price.currency_value)}) — assumido BRL`,
    );
  }
  const moedaEfetiva = moeda ?? 'BRL';

  const bruto = dinheiroDeValorHotmart(
    price.value,
    erros,
    'data.purchase.price.value',
    moedaEfetiva,
  );
  const taxas = taxasDe(bruto, undefined, undefined);

  const isSub =
    Object.keys(subscription).length > 0 || purchase.is_subscription === true;
  const ciclo = inteiroPositivo(purchase.recurrence_number);
  const doc = soDigitos(buyer.document);
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
      documentos: doc ? [doc] : undefined,
      telefones: telefonesDeString(
        buyer.checkout_phone_code as string | undefined,
        buyer.checkout_phone as string | undefined,
      ),
      endereco: enderecoDeHotmart({
        logradouro:
          (textoOuUndefined(address.address) ??
            textoOuUndefined(address.street)) as string | undefined,
        numero: address.number as string,
        complemento: address.complement as string,
        bairro: address.neighborhood as string,
        cidade: address.city as string,
        uf: address.state as string,
        cep: address.zipcode as string,
        pais:
          (textoOuUndefined(address.country) ??
            textoOuUndefined(address.country_iso)) as string | undefined,
      }),
    },
    valores: { bruto, taxas },
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
