import { StatusTransacaoCanonico as S } from '../../../core/core.module';

/**
 * Vocabulário bruto da **Hotmart** → `StatusTransacaoCanonico` (spec 022). A 018
 * deixou `MAPAS_STATUS` vazio "para as specs 019–022 popularem"; 019 entrou com a
 * TMB, 020 com as duas contas Asaas, 021 com as duas contas Guru, esta é a
 * entrada das duas contas Hotmart (`HOTMART_PRD` e `HOTMART_SVC` compartilham o
 * mesmo vocabulário). A chave `fonte` é o `tipoOrigem` que o adapter grava no
 * `EventoCanonico` (`ingestao/adapters/hotmart`).
 *
 * Regras (Regra Inviolável nº 15 / gambiarra 4.4):
 * - **case-sensitive, sem `trim`, sem sinônimos** — `mapearStatus` (018) não
 *   normaliza. A Hotmart usa `SCREAMING_SNAKE_CASE` (`APPROVED`, `WAITING_PAYMENT`);
 *   `UNDER_ANALISYS` é a grafia oficial (com "I"). Um export com rótulos pt-BR
 *   (`Aprovada`…) → adiciona-se a entrada literal, nunca `.toUpperCase()`.
 * - Estados de "carrinho" / pré-venda sem semântica financeira canônica clara na
 *   operação da AEN (`STARTED`, `PRE_ORDER`) ficam **fora** de propósito → caem em
 *   `DESCONHECIDO` + revisão até uma fixture real aparecer (precedente do
 *   `AUTHORIZED` da Asaas / `trial` da Guru).
 * - Qualquer bruto fora daqui → `mapearStatus` devolve `DESCONHECIDO` + revisão.
 */
const VOCABULARIO: Record<string, S> = {
  APPROVED: S.PAGO,
  COMPLETE: S.PAGO,
  PRINTED_BILLET: S.PENDENTE,
  WAITING_PAYMENT: S.PENDENTE,
  UNDER_ANALISYS: S.PENDENTE,
  PROCESSING_TRANSACTION: S.PENDENTE,
  OVERDUE: S.EM_ATRASO,
  NO_FUNDS: S.EM_ATRASO,
  REFUNDED: S.ESTORNADO,
  PARTIALLY_REFUNDED: S.ESTORNADO,
  DISPUTE: S.ESTORNADO,
  CHARGEBACK: S.CHARGEBACK,
  PROTESTED: S.CHARGEBACK,
  CANCELLED: S.CANCELADO,
  EXPIRED: S.CANCELADO,
  BLOCKED: S.RECUSADO,
};

export const HOTMART: Record<string, Record<string, S>> = {
  'hotmart.webhook': VOCABULARIO,
  'hotmart.api': VOCABULARIO,
  // o CSV de export espelha o enum da API (Assumption — sem export real na doc).
  'hotmart.csv': VOCABULARIO,
};
