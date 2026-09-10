import {
  StatusTransacaoCanonico,
  paraStatusTransacaoCanonico,
  type ResolucaoStatus,
} from '../../../core/core.module';
import { TMB } from './tmb';

/**
 * Tradução do **vocabulário bruto de status** de cada plataforma para
 * `StatusTransacaoCanonico` (Padrão Transversal "Status" / Regra Inviolável nº 15).
 *
 * `financeiro` é dono de `status_canonico`; o adapter de borda (specs 019–022) é
 * dono da **extração crua** (produz `EventoCanonico.statusOrigem` + `tipoOrigem`).
 * O mapa rico por fonte entra aqui, **versionado por fonte** — cada spec 019–022
 * adiciona um `status-map/{tmb,asaas,guru,hotmart}.ts` e registra em `MAPAS_STATUS`.
 *
 * Nesta spec (018) o registro está **vazio**: o comportamento seguro por omissão é
 * status bruto não catalogado → `DESCONHECIDO` + revisão — nunca um palpite.
 */

/** `MAPAS_STATUS[plataforma][fonte][statusBruto] = StatusTransacaoCanonico`. */
export const MAPAS_STATUS: Record<
  string,
  Record<string, Record<string, StatusTransacaoCanonico>>
> = {};

// spec 019 — conta única `TMB` (webhook Vendas/Financeiro, API, CSV).
Object.assign(MAPAS_STATUS, { TMB });

export interface ResultadoStatusMapeado extends ResolucaoStatus {
  motivo?: string;
}

/**
 * Puro. (1) valor canônico **exato** → sem revisão; (2) mapa da fonte; (3) nada
 * casou → `DESCONHECIDO` + `revisar` + `motivo`. Não faz `trim`/`lowercase`/
 * sinônimos por conta própria — isso é dado do adapter (D-R5 / research.md).
 */
export function mapearStatus(
  plataforma: string,
  fonte: string,
  bruto: unknown,
): ResultadoStatusMapeado {
  const exato = paraStatusTransacaoCanonico(bruto);
  if (!exato.revisar) return exato;

  if (typeof bruto === 'string') {
    const hit = MAPAS_STATUS[plataforma]?.[fonte]?.[bruto];
    if (hit) return { status: hit, revisar: false };
  }

  return {
    status: StatusTransacaoCanonico.DESCONHECIDO,
    revisar: true,
    motivo: `status bruto não catalogado (${plataforma}/${fonte}): ${JSON.stringify(bruto)}`,
  };
}
