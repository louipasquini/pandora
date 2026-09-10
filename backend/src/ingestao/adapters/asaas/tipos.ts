import type { EventoCanonico } from '../../../core/core.module';

/** Rótulo da fonte da Asaas. É também a chave `fonte` do `status-map` (spec 018). */
export type FonteAsaas = 'asaas.webhook' | 'asaas.api' | 'asaas.csv';

/** As duas contas Asaas (grafia do enum `PlataformaOrigem` do `core`). */
export type ContaAsaas = 'ASAAS_PRD' | 'ASAAS_SVC';

/**
 * Saída **uniforme** dos 3 parsers da Asaas (spec 020). Puro, sem banco.
 *
 * - `eventoCanonico` presente ⇔ o parse montou uma forma canônica que passou no
 *   `eventoCanonicoSchema` do `core`.
 * - `payloadBruto` é sempre o fato cru (objeto/linha) — o webhook/endpoint o
 *   repassa a `RegistrarEventoService` (etapa 0, spec 006) mesmo quando o parse
 *   falhou (nada some silenciosamente — visão 5.3 / A-08).
 * - `erros` nunca faz o parser lançar.
 */
export interface ResultadoParseAsaas {
  eventoCanonico?: EventoCanonico;
  idOrigem?: string;
  tipoOrigem: FonteAsaas;
  payloadBruto: unknown;
  erros: string[];
}
