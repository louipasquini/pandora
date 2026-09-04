/** Barrel — domínio puro de `lead` (spec 008). Sem NestJS, sem Prisma runtime. */
export * from './tipos';
export {
  type Norm,
  apenasDigitos,
  normalizarNome,
  normalizarOrigem,
  normalizarEmail,
  normalizarTelefone,
  normalizarDocumento,
  normalizarTag,
  normalizarTags,
} from './normalizar-lead';
export { calcularScore, PESOS_SCORE_LEAD } from './scoring';
export {
  type PodeConverter,
  podeConverter,
  montarDadosIdentidade,
} from './plano-conversao';
export {
  type ResultadoValor,
  validarValorCampo,
  validarDefinicao,
} from './validar-valor-campo';
