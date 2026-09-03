import { STATUS_TRANSACAO_CANONICO, StatusTransacaoCanonico } from './status-transacao';

const VALORES = new Set<string>(STATUS_TRANSACAO_CANONICO);

export interface ResolucaoStatus {
  status: StatusTransacaoCanonico;
  /** `true` quando o valor bruto não é um status canônico exato — encaminhar para revisão. */
  revisar: boolean;
}

/**
 * Rede de segurança: converte um valor bruto para `StatusTransacaoCanonico`.
 *
 * - Valor **exato** do enum → `{ status, revisar: false }`.
 * - Qualquer outra coisa (string desconhecida, `null`, `undefined`, número,
 *   objeto) → `{ status: DESCONHECIDO, revisar: true }`.
 *
 * **Não** faz `trim` / `lowercase` / sinônimos — o mapa rico de vocabulário por
 * plataforma é responsabilidade dos adapters (specs 019–022), versionado por
 * fonte. Aqui é só a garantia "nunca vira status ativo por engano" (FR-023,
 * Regra Inviolável nº 15).
 */
export function paraStatusTransacaoCanonico(bruto: unknown): ResolucaoStatus {
  if (typeof bruto === 'string' && VALORES.has(bruto)) {
    return { status: bruto as StatusTransacaoCanonico, revisar: false };
  }
  return { status: StatusTransacaoCanonico.DESCONHECIDO, revisar: true };
}
