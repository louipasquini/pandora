import { StatusTransacaoCanonico as S } from '../../../core/core.module';

/**
 * Vocabulário bruto da **TMB** → `StatusTransacaoCanonico`, **por fonte**
 * (spec 019). A 018 deixou `MAPAS_STATUS` vazio "para as specs 019–022 popularem";
 * esta é a entrada da TMB. A chave `fonte` é o `tipoOrigem` que o adapter grava
 * no `EventoCanonico` (`ingestao/adapters/tmb`).
 *
 * Regras (Regra Inviolável nº 15 / gambiarra 4.4):
 * - **case-sensitive, sem `trim`, sem sinônimos** — `mapearStatus` (018) não
 *   normaliza. Vocabulário exato vem das fixtures reais; caixa/acento diferente
 *   → adiciona-se a entrada literal, nunca `.toLowerCase()`.
 * - `status_financeiro` de **pedido** (`Adimplente`/`Inadimplente`) **não entra**
 *   — é resumo de carteira, não estado de transação; fica só no `payload_bruto`.
 * - Qualquer bruto fora daqui → `mapearStatus` devolve `DESCONHECIDO` + revisão.
 */
export const TMB: Record<string, Record<string, S>> = {
  'tmb.webhook-vendas': {
    Efetivado: S.PAGO,
    Cancelado: S.CANCELADO,
  },
  'tmb.api': {
    Efetivado: S.PAGO,
    Cancelado: S.CANCELADO,
  },
  'tmb.webhook-financeiro': {
    Recebido: S.PAGO,
    'Aguardando pagamento': S.PENDENTE,
    Vencido: S.EM_ATRASO,
    Estornado: S.ESTORNADO,
    DELETED: S.CANCELADO,
  },
  'tmb.csv': {
    Efetivado: S.PAGO,
    Cancelado: S.CANCELADO,
  },
};
