import type { CamposCanonicosGuru } from './montar';
import {
  dinheiroDeValorGuru,
  enderecoDeGuru,
  moedaDeGuru,
  soDigitos,
  taxasDe,
  telefonesDeString,
  textoOuUndefined,
} from './normalizar-guru';

export type Rec = Record<string, unknown>;

export function ehObjeto(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function obj(v: unknown): Rec {
  return ehObjeto(v) ? v : {};
}

function inteiroPositivo(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : Number(textoOuUndefined(v));
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/** `dates.confirmed_at` ?? `.ordered_at` ?? `.created_at` ?? `.updated_at` (G-12). */
function ocorridoDe(dates: Rec): string {
  return (
    textoOuUndefined(dates.confirmed_at) ??
    textoOuUndefined(dates.ordered_at) ??
    textoOuUndefined(dates.created_at) ??
    textoOuUndefined(dates.updated_at) ??
    ''
  );
}

function compradorDe(contact: Rec): CamposCanonicosGuru['comprador'] {
  const doc = soDigitos(contact.doc);
  const email = textoOuUndefined(contact.email);
  return {
    nome: textoOuUndefined(contact.name),
    emails: email ? [email] : undefined,
    documentos: doc ? [doc] : undefined,
    telefones: telefonesDeString(
      contact.phone_local_code as string | undefined,
      contact.phone_number as string | undefined,
    ),
    endereco: enderecoDeGuru({
      logradouro: contact.address as string,
      numero: contact.address_number as string,
      complemento: contact.address_comp as string,
      bairro: contact.address_district as string,
      cidade: contact.address_city as string,
      uf: contact.address_state as string,
      cep: contact.address_zip_code as string,
      pais: contact.address_country as string,
    }),
  };
}

function ofertaDe(product: Rec, primeiroItem: Rec): CamposCanonicosGuru['oferta'] {
  const offer = obj(product.offer);
  const itemOffer = obj(primeiroItem.offer);
  return {
    codigoOrigem:
      textoOuUndefined(offer.id) ?? textoOuUndefined(itemOffer.id),
    nomeOrigem:
      textoOuUndefined(offer.name) ??
      textoOuUndefined(product.name) ??
      textoOuUndefined(primeiroItem.name),
    quantidade: inteiroPositivo(product.qty),
  };
}

/**
 * Extrai os `CamposCanonicosGuru` de um objeto de **transação** da Guru —
 * **idêntico** no webhook e na API (a forma do objeto é a mesma, a API só não
 * traz `api_token`/`webhook_type`). Puro; nunca lança.
 *
 * A moeda vem de `payment.currency` (ISO 4217 validado); ausente/inválida →
 * `"BRL"` (default explícito da borda). `statusOrigem` é o `status` cru da venda.
 */
export function camposDeTransacao(t: Rec, erros: string[]): CamposCanonicosGuru {
  const payment = obj(t.payment);
  const product = obj(t.product);
  const dates = obj(t.dates);
  const contact = obj(t.contact);
  const subscription = obj(t.subscription);
  const invoice = obj(t.invoice);
  const itens = Array.isArray(t.items) ? (t.items as unknown[]) : [];
  const primeiroItem = obj(itens[0]);

  const moeda = moedaDeGuru(payment.currency);
  if (payment.currency != null && moeda === undefined) {
    erros.push(`payment.currency inválida (${JSON.stringify(payment.currency)}) — assumido BRL`);
  }
  const moedaEfetiva = moeda ?? 'BRL';

  const bruto = dinheiroDeValorGuru(payment.gross, erros, 'payment.gross', moedaEfetiva);
  const liquido = dinheiroDeValorGuru(payment.net, erros, 'payment.net', moedaEfetiva);
  const taxaExplicita = dinheiroDeValorGuru(
    obj(payment.tax).value,
    erros,
    'payment.tax.value',
    moedaEfetiva,
  );

  const ehPlano = textoOuUndefined(product.type) === 'plan';
  const temAssinatura = ehPlano && textoOuUndefined(subscription.id) !== undefined;

  return {
    idOrigem: textoOuUndefined(t.id),
    statusOrigem: textoOuUndefined(t.status) ?? '',
    ocorridoEm: ocorridoDe(dates),
    comprador: compradorDe(contact),
    valores: { bruto, liquido, taxas: taxasDe(bruto, liquido, taxaExplicita) },
    oferta: ofertaDe(product, primeiroItem),
    assinaturaRecorrencia: temAssinatura,
    numeroCiclo: temAssinatura ? inteiroPositivo(invoice.cycle) : undefined,
    ehAfiliada: textoOuUndefined(t.type) === 'affiliate' ? true : undefined,
  };
}
