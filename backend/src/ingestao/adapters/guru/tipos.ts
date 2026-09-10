import type { EventoCanonico } from '../../../core/core.module';

/** Rótulo da fonte da Guru. É também a chave `fonte` do `status-map` (spec 018). */
export type FonteGuru = 'guru.webhook' | 'guru.api' | 'guru.csv';

/** As duas contas Guru (grafia do enum `PlataformaOrigem` do `core`). */
export type ContaGuru = 'GURU_PRD' | 'GURU_SVC';

/**
 * Saída **uniforme** dos 3 parsers da Guru (spec 021). Puro, sem banco.
 *
 * - `eventoCanonico` presente ⇔ o parse montou uma forma canônica que passou no
 *   `eventoCanonicoSchema` do `core`.
 * - `payloadBruto` é sempre o fato cru (objeto/linha) — o webhook/endpoint o
 *   repassa a `RegistrarEventoService` (etapa 0, spec 006) mesmo quando o parse
 *   falhou (nada some silenciosamente — visão 5.3 / G-08). **No webhook, o
 *   `payloadBruto` NÃO carrega `api_token`** (segredo — G-14).
 * - `erros` nunca faz o parser lançar.
 */
export interface ResultadoParseGuru {
  eventoCanonico?: EventoCanonico;
  idOrigem?: string;
  tipoOrigem: FonteGuru;
  payloadBruto: unknown;
  erros: string[];
}
