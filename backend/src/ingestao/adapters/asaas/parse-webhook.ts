import { montarResultado } from './montar';
import { camposDePagamento, ehObjeto, type Rec } from './pagamento';
import type { ContaAsaas, ResultadoParseAsaas } from './tipos';

/** `{ event, payment }` cru + o objeto `payment` extraído. */
interface Envelope {
  bruto: unknown;
  payment: Rec | null;
}

/** Normaliza o corpo do webhook para 1..N envelopes `{ event, payment }`. */
function envelopes(payload: unknown): Envelope[] {
  const els = Array.isArray(payload) ? payload : [payload];
  return els.map((el) => {
    if (ehObjeto(el) && ehObjeto(el.payment)) return { bruto: el, payment: el.payment };
    if (ehObjeto(el) && el.object === 'payment') return { bruto: el, payment: el }; // achatado
    return { bruto: el, payment: null };
  });
}

/**
 * Adapter Asaas — **webhook de cobrança** (spec 020). Corpo
 * `{ event: "PAYMENT_*", payment: {…} }` (a Asaas manda 1 por request; o parser
 * também aceita um array disso). `id_origem = String(payment.id)` (A-01); os N
 * eventos de uma cobrança colapsam na mesma `transacao` (último evento vence).
 * O `payload_bruto` registrado é o **envelope inteiro** `{ event, payment }` —
 * eventos distintos do mesmo pagamento têm hashes distintos (2 `evento_origem`),
 * reentrega do mesmo evento é dedup por hash. Puro; nunca lança. `conta`
 * (`ASAAS_PRD`/`ASAAS_SVC`) vem do path do webhook.
 */
export function parseWebhookAsaas(
  payload: unknown,
  conta: ContaAsaas,
): ResultadoParseAsaas[] {
  return envelopes(payload).map(({ bruto, payment }) => {
    if (!payment) {
      return {
        tipoOrigem: 'asaas.webhook',
        payloadBruto: bruto,
        erros: ['payload sem objeto payment'],
      };
    }
    const erros: string[] = [];
    return montarResultado(
      conta,
      'asaas.webhook',
      bruto,
      camposDePagamento(payment, erros),
      erros,
    );
  });
}
