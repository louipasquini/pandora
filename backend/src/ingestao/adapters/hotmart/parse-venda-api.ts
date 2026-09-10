import { camposDeCompraApi, ehObjeto, obj, type Rec } from './compra';
import { montarResultado } from './montar';
import type { ContaHotmart, ResultadoParseHotmart } from './tipos';

/**
 * Adapter Hotmart — **API `GET /payments/api/v1/sales/history`** (spec 022). Cada
 * item de `items[]` (`{ product, buyer, producer, purchase }`).
 * `id_origem = String(purchase.transaction)` (H-04). Os N estados de uma compra
 * colapsam na mesma `transacao` (último evento vence).
 *
 * `detalhePreco` = o item de `GET /sales/price/details` casado por `transaction`
 * (opcional — H-02). Quando presente, é anexado ao `payload_bruto` sob
 * `price_details` e usado para refinar `valores.taxas` (`fee + vat`). Ausência
 * **não** é erro (FR-013). Puro; nunca lança. `conta` vem do DTO de
 * `/ingestao/hotmart/sincronizar`.
 */
export function parseVendaApi(
  item: unknown,
  conta: ContaHotmart,
  detalhePreco?: unknown,
): ResultadoParseHotmart {
  if (!ehObjeto(item)) {
    return { tipoOrigem: 'hotmart.api', payloadBruto: item, erros: ['item não é objeto'] };
  }
  const erros: string[] = [];
  const detalhe = ehObjeto(detalhePreco) ? (detalhePreco as Rec) : undefined;
  const payloadBruto: Rec = detalhe ? { ...item, price_details: detalhe } : { ...item };
  return montarResultado(
    conta,
    'hotmart.api',
    payloadBruto,
    camposDeCompraApi(obj(item), detalhe, erros),
    erros,
  );
}
