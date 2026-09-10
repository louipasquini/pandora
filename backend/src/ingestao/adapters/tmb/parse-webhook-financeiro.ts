import { montarResultado } from './montar';
import { soDigitos, textoOuUndefined } from './normalizar-tmb';
import type { ResultadoParseTmb } from './tipos';

type Rec = Record<string, unknown>;

function ehObjeto(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Extrai a lista de `dados` de qualquer forma que a TMB mande. */
function itens(payload: unknown): Rec[] {
  if (Array.isArray(payload)) {
    return payload.flatMap((el) => {
      if (ehObjeto(el) && ehObjeto(el.dados)) return [el.dados];
      if (ehObjeto(el)) return [el]; // já achatado
      return [];
    });
  }
  if (ehObjeto(payload) && ehObjeto(payload.dados)) return [payload.dados];
  if (ehObjeto(payload)) return [payload];
  return [];
}

/** `data_pagamento` se presente, senão `vencimento_parcela`, senão `''` (D-09). */
function ocorridoDe(d: Rec): string {
  return (
    textoOuUndefined(d.data_pagamento) ?? textoOuUndefined(d.vencimento_parcela) ?? ''
  );
}

/**
 * Adapter TMB — **webhook Financeiro** (spec 019). Array `[{ dados: {...} }]`,
 * nível de **parcela**, campo de status `status_pagamento`. Um `EventoCanonico`
 * por item; `id_origem = String(pedido_id)` (D-01) — os N eventos de parcela de
 * um pedido colapsam na mesma `transacao`, último evento vence (D-02). **Não
 * emite `valores`** (FR-012 — o payload não traz valores de venda; deixá-los
 * ausentes evita que `camposAlterados` da spec 018 zere o valor já gravado).
 */
export function parseWebhookFinanceiro(payload: unknown): ResultadoParseTmb[] {
  const fonte = 'tmb.webhook-financeiro' as const;
  return itens(payload).map((d) => {
    const erros: string[] = [];
    return montarResultado(
      fonte,
      d,
      {
        idOrigem: textoOuUndefined(d.pedido_id),
        statusOrigem: textoOuUndefined(d.status_pagamento) ?? '',
        ocorridoEm: ocorridoDe(d),
        comprador: {
          nome: textoOuUndefined(d.cliente),
          emails: textoOuUndefined(d.cliente_email)
            ? [String(d.cliente_email).trim()]
            : undefined,
          documentos: soDigitos(d.cliente_documento)
            ? [soDigitos(d.cliente_documento)]
            : undefined,
        },
        oferta: { nomeOrigem: textoOuUndefined(d.produto) },
      },
      erros,
    );
  });
}
