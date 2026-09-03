import { PUBLIC_PATH_PREFIXES } from '../auth.constants';

export { PUBLIC_PATH_PREFIXES };

/**
 * `true` se o path pertence à allowlist por prefixo (FR-010). O `JwtAuthGuard`
 * consulta isto **depois** de checar `@Public()` no handler/classe.
 */
export function ehRotaPublicaPorPath(path: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((prefixo) => path.startsWith(prefixo));
}
