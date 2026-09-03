import { EtapaIngestao } from '@prisma/client';

/**
 * Registro **ordenado** das etapas do pipeline canônico (visão 5.3), com
 * **dependências declaradas como dado** (CL-04). O worker e `planejarPassada`
 * são genéricos — leem este grafo, não têm `if` por etapa.
 *
 * Nesta spec só `REGISTRAR` (feita na porta de ingestão) e `CLASSIFICAR` são
 * reais; 2–6 são _no-op_ `pulada`. Uma spec futura pluga a implementação real
 * (via `WorkerService.definirExecutor`) **sem** tocar o worker.
 */
export interface EtapaDef {
  readonly nome: EtapaIngestao;
  readonly ordem: number;
  readonly dependeDe: readonly EtapaIngestao[];
  /** nº da spec que a implementa de verdade. */
  readonly especDona: number;
}

export const ETAPAS: readonly EtapaDef[] = Object.freeze([
  { nome: EtapaIngestao.REGISTRAR, ordem: 0, dependeDe: [], especDona: 6 },
  {
    nome: EtapaIngestao.CLASSIFICAR,
    ordem: 1,
    dependeDe: [EtapaIngestao.REGISTRAR],
    especDona: 6,
  },
  {
    nome: EtapaIngestao.RESOLVER_PESSOA,
    ordem: 2,
    dependeDe: [EtapaIngestao.CLASSIFICAR],
    especDona: 18,
  },
  {
    nome: EtapaIngestao.UPSERT_TRANSACAO,
    ordem: 3,
    dependeDe: [EtapaIngestao.RESOLVER_PESSOA],
    especDona: 18,
  },
  {
    nome: EtapaIngestao.RESOLVER_VINCULO,
    ordem: 4,
    dependeDe: [EtapaIngestao.UPSERT_TRANSACAO],
    especDona: 24,
  },
  {
    nome: EtapaIngestao.RESOLVER_OFERTA,
    ordem: 5,
    dependeDe: [EtapaIngestao.UPSERT_TRANSACAO],
    especDona: 23,
  },
  {
    nome: EtapaIngestao.PROJETAR_CONTRATO,
    ordem: 6,
    dependeDe: [EtapaIngestao.UPSERT_TRANSACAO],
    especDona: 25,
  },
] as const);

/** As 6 etapas que o worker roda (todas menos `REGISTRAR`, feita na ingestão). */
export const ETAPAS_DO_WORKER: readonly EtapaDef[] = ETAPAS.filter(
  (e) => e.nome !== EtapaIngestao.REGISTRAR,
);

export const ETAPA_POR_NOME: ReadonlyMap<EtapaIngestao, EtapaDef> = new Map(
  ETAPAS.map((e) => [e.nome, e]),
);
