import type { EventoCanonico } from '../../../core/core.module';

/** Rótulo da fonte da TMB. É também a chave `fonte` do `status-map` (spec 018). */
export type FonteTmb =
  | 'tmb.webhook-vendas'
  | 'tmb.webhook-financeiro'
  | 'tmb.api'
  | 'tmb.csv';

/**
 * Saída **uniforme** dos 4 parsers da TMB (spec 019). Puro, sem banco.
 *
 * - `eventoCanonico` presente ⇔ o parse montou uma forma canônica que passou no
 *   `eventoCanonicoSchema` do `core`.
 * - `payloadBruto` é sempre o fato cru (objeto/linha) — o webhook/endpoint o
 *   repassa a `RegistrarEventoService` (etapa 0, spec 006) mesmo quando o parse
 *   falhou (nada some silenciosamente — visão 5.3 / D-07).
 * - `erros` nunca faz o parser lançar.
 */
export interface ResultadoParseTmb {
  eventoCanonico?: EventoCanonico;
  idOrigem?: string;
  tipoOrigem: FonteTmb;
  payloadBruto: unknown;
  erros: string[];
}
