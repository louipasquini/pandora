import { montarResultado } from './montar';
import { camposDeTransacao, ehObjeto } from './transacao';
import type { ContaGuru, ResultadoParseGuru } from './tipos';

/**
 * Adapter Guru — **API `GET /api/v2/transactions`** (spec 021). Cada item de
 * `data[]`. O objeto tem a **mesma forma** do de webhook (menos `api_token` /
 * `webhook_type`) → reaproveita `camposDeTransacao`; só troca `tipoOrigem` para
 * `"guru.api"`. `id_origem = String(transaction.id)` (G-01). `conta` vem do DTO
 * de `/ingestao/guru/sincronizar`.
 */
export function parseTransacaoApi(
  item: unknown,
  conta: ContaGuru,
): ResultadoParseGuru {
  if (!ehObjeto(item)) {
    return { tipoOrigem: 'guru.api', payloadBruto: item, erros: ['item não é objeto'] };
  }
  const erros: string[] = [];
  return montarResultado(
    conta,
    'guru.api',
    item,
    camposDeTransacao(item, erros),
    erros,
  );
}
