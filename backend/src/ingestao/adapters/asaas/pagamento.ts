import type { CamposCanonicosAsaas } from './montar';
import {
  dinheiroDeValorAsaas,
  taxasDe,
  textoOuUndefined,
} from './normalizar-asaas';

export type Rec = Record<string, unknown>;

export function ehObjeto(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** `paymentDate` ?? `confirmedDate` ?? `clientPaymentDate` ?? `dateCreated` (A-12). */
function ocorridoDe(p: Rec): string {
  return (
    textoOuUndefined(p.paymentDate) ??
    textoOuUndefined(p.confirmedDate) ??
    textoOuUndefined(p.clientPaymentDate) ??
    textoOuUndefined(p.dateCreated) ??
    ''
  );
}

/**
 * Extrai os `CamposCanonicosAsaas` de um objeto `payment` da Asaas — **idêntico**
 * no webhook e na API (a forma do objeto é a mesma). A Asaas não embute os dados
 * de contato do cliente no `payment` (só `customer: "cus_…"`), então `comprador`
 * fica vazio aqui — só o CSV monta comprador.
 *
 * `statusOrigem` = `payment.status` cru, **exceto** quando `deleted === true`
 * (cobrança removida): o `status` fica congelado no valor anterior e não reflete
 * a remoção, então o adapter emite `"DELETED"` (conceito real da Asaas —
 * determinístico, não um palpite — A-05). `status-map` traduz `DELETED → CANCELADO`.
 */
export function camposDePagamento(payment: Rec, erros: string[]): CamposCanonicosAsaas {
  const bruto = dinheiroDeValorAsaas(payment.value, erros, 'value');
  const liquido = dinheiroDeValorAsaas(payment.netValue, erros, 'netValue');

  const statusOrigem =
    payment.deleted === true
      ? 'DELETED'
      : (textoOuUndefined(payment.status) ?? '');

  return {
    idOrigem: textoOuUndefined(payment.id),
    statusOrigem,
    ocorridoEm: ocorridoDe(payment),
    valores: { bruto, liquido, taxas: taxasDe(bruto, liquido) },
    referenciaExternaIdOrigem: textoOuUndefined(payment.externalReference),
    assinaturaRecorrencia: textoOuUndefined(payment.subscription) !== undefined,
    oferta: { nomeOrigem: textoOuUndefined(payment.description) },
  };
}
