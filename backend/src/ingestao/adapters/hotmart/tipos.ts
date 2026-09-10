import type { EventoCanonico } from '../../../core/core.module';

/** Rótulo da fonte da Hotmart. É também a chave `fonte` do `status-map` (spec 018). */
export type FonteHotmart = 'hotmart.webhook' | 'hotmart.api' | 'hotmart.csv';

/** As duas contas Hotmart (grafia do enum `PlataformaOrigem` do `core`). */
export type ContaHotmart = 'HOTMART_PRD' | 'HOTMART_SVC';

/**
 * Saída **uniforme** dos parsers da Hotmart (spec 022). Puro, sem banco.
 *
 * - `eventoCanonico` presente ⇔ o parse montou uma forma canônica que passou no
 *   `eventoCanonicoSchema` do `core`.
 * - `payloadBruto` é sempre o fato cru (objeto/linha) — o endpoint/webhook o
 *   repassa a `RegistrarEventoService` (etapa 0, spec 006) mesmo quando o parse
 *   falhou (nada some silenciosamente — visão 5.3 / H-09). **Nunca carrega
 *   segredo** (`client_secret`/Basic/`access_token`/`hottok` — H-14).
 * - `erros` nunca faz o parser lançar.
 */
export interface ResultadoParseHotmart {
  eventoCanonico?: EventoCanonico;
  idOrigem?: string;
  tipoOrigem: FonteHotmart;
  payloadBruto: unknown;
  erros: string[];
}
