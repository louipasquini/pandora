import { camposDeCompraWebhook } from './compra-webhook';
import { ehObjeto, obj, type Rec } from './compra';
import { montarResultado } from './montar';
import type { ContaHotmart, ResultadoParseHotmart } from './tipos';

/** Remove `hottok` (defesa — H-08) do envelope, devolvendo uma cópia rasa. */
function semHottok(o: Rec): Rec {
  if (!('hottok' in o)) return o;
  const { hottok: _omitido, ...resto } = o;
  void _omitido;
  return resto;
}

/**
 * Adapter Hotmart — **webhook de compras `PURCHASE_*`** (spec 022 — **stub para
 * feature futura**, ligado por `HOTMART_WEBHOOK_ENABLED`). Corpo =
 * `{ id, event, version, creation_date, data: { product, buyer, purchase,
 * subscription, ... } }`; a Hotmart manda 1 por request, o parser também aceita
 * um array defensivamente. `id_origem = String(data.purchase.transaction)` (H-04).
 *
 * O `payload_bruto` registrado é o corpo **sem `hottok`** (o `hottok` real vem no
 * header `X-HOTMART-HOTTOK`, mas nunca deve persistir se vier no corpo). Puro;
 * nunca lança. `conta` (`HOTMART_PRD`/`HOTMART_SVC`) vem do path do webhook.
 */
export function parseWebhookHotmart(
  payload: unknown,
  conta: ContaHotmart,
): ResultadoParseHotmart[] {
  const els = Array.isArray(payload) ? payload : [payload];
  return els.map((el) => {
    if (!ehObjeto(el)) {
      return {
        tipoOrigem: 'hotmart.webhook',
        payloadBruto: el,
        erros: ['payload não é objeto'],
      };
    }
    const bruto = semHottok(el as Rec);
    const erros: string[] = [];
    return montarResultado(
      conta,
      'hotmart.webhook',
      bruto,
      camposDeCompraWebhook(obj((el as Rec).data), erros),
      erros,
    );
  });
}
