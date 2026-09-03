/**
 * Constantes da autenticação de serviço (spec 003). Sem dependência de runtime —
 * podem ser importadas por guard, controller, testes e (o valor de storage) pelo
 * frontend como referência.
 */

/** Emissor fixo do JWT de serviço. Verificado na emissão e na validação. */
export const JWT_ISSUER = 'pandora';

/** Algoritmo único aceito na verificação do JWT (nunca `none`). */
export const JWT_ALGORITHMS = ['HS256'] as const;

/** Tolerância de _clock skew_ na validação de `exp`/`nbf`/`iat`, em segundos. */
export const JWT_CLOCK_TOLERANCE_S = 60;

/** Metadata-key do decorator `@Public()` (rota isenta do guard de JWT). */
export const IS_PUBLIC_KEY = 'pandora:isPublic';

/**
 * Prefixos de path isentos do guard de JWT (allowlist central, FR-010).
 * `/webhooks/*` é reservado para as specs 019–022, que autenticam por
 * `WebhookAuthenticator` (mecanismo separado). Alterar esta lista é um diff
 * revisável (FR-011).
 */
export const PUBLIC_PATH_PREFIXES = ['/webhooks/'] as const;

/** Chave de `localStorage` onde o painel guarda o token (referência p/ o frontend). */
export const TOKEN_STORAGE_KEY = 'pandora.token';

// --- RBAC (spec 004) ---

/** Metadata-key do `@RequerPermissao(...)` (permissões exigidas por um handler). */
export const PERM_METADATA_KEY = 'pandora:rbac:requer';

/** Metadata-key do `@AutenticadoBasta()` (rota que exige só JWT válido, sem permissão). */
export const AUTENTICADO_BASTA_KEY = 'pandora:rbac:autenticadoBasta';

/**
 * Id fixo do perfil de sistema `administrador`. É `de_sistema`, imutável, e a
 * resolução de permissões o trata como "concede o catálogo inteiro" (não depende
 * das linhas de `perfil_permissao` estarem sincronizadas — ver `resolver-permissoes.ts`).
 */
export const PERFIL_ADMIN_ID = '01a06769-2c28-7623-986e-6c6b610505f8';
export const PERFIL_ADMIN_NOME = 'Administrador';
export const PERFIL_ADMIN_NOME_NORMALIZADO = 'administrador';
