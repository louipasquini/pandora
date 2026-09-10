export {
  PAINEIS_DASHBOARD,
  PAINEL_IDS,
  type PainelDef,
  type PainelId,
  type FormatoPainel,
  ehPainelConhecido,
  painelPorId,
  painelEhTabular,
  painelVisivel,
  paineisVisiveis,
  assertCatalogoPaineisCoerente,
} from './paineis';
export {
  resolverPeriodo,
  type PeriodoResolvido,
  type BucketSerie,
} from './periodo';
export { calcularDelta, type Delta } from './benchmark';
export {
  agruparEmBuckets,
  rotuloBucket,
  type PontoDatado,
  type PontoSerie,
} from './serie-temporal';
export {
  METRICAS_META,
  METRICA_META_IDS,
  type MetricaMetaDef,
  type MetricaMetaId,
  type MetaPeriodoTipo,
  type IntervaloPeriodo,
  type StatusMeta,
  type AtingimentoMeta,
  metricaMetaPorId,
  periodoDaMeta,
  normalizarReferencia,
  statusMeta,
} from './meta';
export {
  combinarRankingComercial,
  type EntradaRankingComercial,
  type GanhasPorResponsavel,
  type ValorPorMoeda,
} from './ranking';
