import { StatusTransacaoCanonico as S } from '../../../core/core.module';

/**
 * Vocabulário bruto da **Asaas** → `StatusTransacaoCanonico` (spec 020). A 018
 * deixou `MAPAS_STATUS` vazio "para as specs 019–022 popularem"; a 019 entrou com
 * a TMB, esta é a entrada das duas contas Asaas (`ASAAS_PRD` e `ASAAS_SVC`
 * compartilham o mesmo vocabulário). A chave `fonte` é o `tipoOrigem` que o
 * adapter grava no `EventoCanonico` (`ingestao/adapters/asaas`).
 *
 * Regras (Regra Inviolável nº 15 / gambiarra 4.4):
 * - **case-sensitive, sem `trim`, sem sinônimos** — `mapearStatus` (018) não
 *   normaliza. Vocabulário exato vem das fixtures reais; um export com rótulos
 *   pt-BR (`Recebida`…) → adiciona-se a entrada literal, nunca `.toLowerCase()`.
 * - `DELETED` é **sintético**: o adapter emite quando `payment.deleted === true`
 *   (a cobrança foi removida e `payment.status` fica congelado — A-05 / D-R9).
 * - `AUTHORIZED` (pré-autorização de cartão) fica **fora** de propósito → cai em
 *   `DESCONHECIDO` + revisão até uma fixture real aparecer.
 * - Qualquer bruto fora daqui → `mapearStatus` devolve `DESCONHECIDO` + revisão.
 */
const VOCABULARIO: Record<string, S> = {
  RECEIVED: S.PAGO,
  CONFIRMED: S.PAGO,
  RECEIVED_IN_CASH: S.PAGO,
  DUNNING_RECEIVED: S.PAGO,
  PENDING: S.PENDENTE,
  AWAITING_RISK_ANALYSIS: S.PENDENTE,
  OVERDUE: S.EM_ATRASO,
  DUNNING_REQUESTED: S.EM_ATRASO,
  REFUNDED: S.ESTORNADO,
  REFUND_REQUESTED: S.ESTORNADO,
  REFUND_IN_PROGRESS: S.ESTORNADO,
  CHARGEBACK_REQUESTED: S.CHARGEBACK,
  CHARGEBACK_DISPUTE: S.CHARGEBACK,
  AWAITING_CHARGEBACK_REVERSAL: S.CHARGEBACK,
  DELETED: S.CANCELADO,
};

export const ASAAS: Record<string, Record<string, S>> = {
  'asaas.webhook': VOCABULARIO,
  'asaas.api': VOCABULARIO,
  // o CSV de export espelha o enum da API (Assumption — sem export real na doc).
  'asaas.csv': VOCABULARIO,
};
