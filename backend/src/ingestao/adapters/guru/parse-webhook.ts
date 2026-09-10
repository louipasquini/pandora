import { montarResultado } from './montar';
import { camposDeTransacao, ehObjeto, type Rec } from './transacao';
import type { ContaGuru, ResultadoParseGuru } from './tipos';

/** Remove `api_token` (segredo — G-14) do objeto, devolvendo uma cópia rasa. */
function semApiToken(obj: Rec): Rec {
  if (!('api_token' in obj)) return obj;
  const { api_token: _omitido, ...resto } = obj;
  void _omitido;
  return resto;
}

/**
 * Adapter Guru — **webhook de Vendas** (spec 021). Corpo = um objeto de transação
 * Guru (`{ id, status, dates, payment, contact, product, subscription, type,
 * api_token, webhook_type }`); a Guru manda 1 por request, o parser também aceita
 * um array disso defensivamente. `id_origem = String(transaction.id)` (G-01); os
 * N webhooks de uma venda colapsam na mesma `transacao` (último evento vence).
 *
 * O `payload_bruto` registrado é o corpo **sem `api_token`** (o token é o Account
 * Token da conta — segredo, nunca persiste). Puro; nunca lança. `conta`
 * (`GURU_PRD`/`GURU_SVC`) vem do path do webhook.
 */
export function parseWebhookGuru(
  payload: unknown,
  conta: ContaGuru,
): ResultadoParseGuru[] {
  const els = Array.isArray(payload) ? payload : [payload];
  return els.map((el) => {
    if (!ehObjeto(el)) {
      return {
        tipoOrigem: 'guru.webhook',
        payloadBruto: el,
        erros: ['payload não é objeto'],
      };
    }
    const bruto = semApiToken(el);
    const erros: string[] = [];
    return montarResultado(
      conta,
      'guru.webhook',
      bruto,
      camposDeTransacao(el, erros),
      erros,
    );
  });
}
