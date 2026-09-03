/**
 * Barrel do domínio puro de `clientes` (spec 005). Sem I/O, sem Prisma.
 * É a fonte da engine de identidade que a spec 018 consome via `ResolverOuCriarService`.
 */
export * from './tipos';
export {
  apenasDigitos,
  classificarDocumento,
  validarCpf,
  validarCnpj,
  type DocumentoTipo,
  type DocumentoClassificado,
} from './documento';
export {
  normalizarEmail,
  normalizarTelefone,
  normalizarDocumento,
  normalizarChaves,
  type Normalizacao,
  type ChavesIdentidade,
  type DocumentoNormalizado,
} from './normalizar';
export { resolverIdentidade } from './resolver-identidade';
export {
  planoDeMerge,
  planoDeReversao,
  type PlanoMerge,
  type PlanoReversao,
  type Divergencia,
  type SnapshotPessoa,
  type SnapshotConta,
  type SnapshotContato,
  type SnapshotDocumento,
  type SnapshotEndereco,
  type SnapshotOrigemRef,
} from './merge-plano';
