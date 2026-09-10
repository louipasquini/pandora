import { montarResultado } from './montar';
import { camposDePagamento, ehObjeto } from './pagamento';
import type { ContaAsaas, ResultadoParseAsaas } from './tipos';

/**
 * Adapter Asaas — **API `GET /v3/payments`** (spec 020). Cada item de `data[]`.
 * O objeto `payment` da API tem a **mesma forma** do de webhook → reaproveita
 * `camposDePagamento`; só troca `tipoOrigem` para `"asaas.api"`. `id_origem =
 * String(payment.id)` (A-01). `conta` vem do DTO de `/ingestao/asaas/sincronizar`.
 */
export function parsePagamentoApi(
  item: unknown,
  conta: ContaAsaas,
): ResultadoParseAsaas {
  if (!ehObjeto(item)) {
    return { tipoOrigem: 'asaas.api', payloadBruto: item, erros: ['item não é objeto'] };
  }
  const erros: string[] = [];
  return montarResultado(
    conta,
    'asaas.api',
    item,
    camposDePagamento(item, erros),
    erros,
  );
}
