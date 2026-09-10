import { StatusTransacaoCanonico as S } from '../../../core/core.module';

/**
 * Vocabulário bruto da **Guru** → `StatusTransacaoCanonico` (spec 021). A 018
 * deixou `MAPAS_STATUS` vazio "para as specs 019–022 popularem"; 019 entrou com a
 * TMB, 020 com as duas contas Asaas, esta é a entrada das duas contas Guru
 * (`GURU_PRD` e `GURU_SVC` compartilham o mesmo vocabulário). A chave `fonte` é o
 * `tipoOrigem` que o adapter grava no `EventoCanonico`
 * (`ingestao/adapters/guru`).
 *
 * Regras (Regra Inviolável nº 15 / gambiarra 4.4):
 * - **case-sensitive, sem `trim`, sem sinônimos** — `mapearStatus` (018) não
 *   normaliza. Vocabulário exato vem das fixtures reais; um export com rótulos
 *   pt-BR (`Aprovada`…) → adiciona-se a entrada literal, nunca `.toLowerCase()`.
 * - Estados de "carrinho" / repasse ao produtor sem semântica financeira canônica
 *   clara na operação da AEN (`trial`, `started`, `abandoned`, `scheduled`,
 *   `pending_transfer`, `transferred`) ficam **fora** de propósito → caem em
 *   `DESCONHECIDO` + revisão até uma fixture real aparecer (precedente do
 *   `AUTHORIZED` da Asaas).
 * - Qualquer bruto fora daqui → `mapearStatus` devolve `DESCONHECIDO` + revisão.
 */
const VOCABULARIO: Record<string, S> = {
  approved: S.PAGO,
  completed: S.PAGO,
  waiting_payment: S.PENDENTE,
  pending: S.PENDENTE,
  billet_printed: S.PENDENTE,
  processing: S.PENDENTE,
  analysis: S.PENDENTE,
  charging: S.PENDENTE,
  delayed: S.EM_ATRASO,
  in_recovery: S.EM_ATRASO,
  refunded: S.ESTORNADO,
  dispute: S.ESTORNADO,
  chargeback: S.CHARGEBACK,
  canceled: S.CANCELADO,
  expired: S.CANCELADO,
  rejected: S.RECUSADO,
  failed: S.RECUSADO,
  blocked: S.RECUSADO,
};

export const GURU: Record<string, Record<string, S>> = {
  'guru.webhook': VOCABULARIO,
  'guru.api': VOCABULARIO,
  // o CSV de export espelha o enum da API (Assumption — sem export real na doc).
  'guru.csv': VOCABULARIO,
};
