import { SetMetadata } from '@nestjs/common';
import { PERM_METADATA_KEY } from '../../auth.constants';
import type { Permissao } from '../catalogo';

/**
 * Marca um handler/controller com as permissões que ele exige. Semântica **E**:
 * o sujeito precisa de **todas**. O `PermissionGuard` (2º `APP_GUARD`) lê isto.
 *
 * Chamar sem argumentos é erro de código (não faria nada útil e o boot já
 * rejeita permissão fora do catálogo).
 */
export function RequerPermissao(...permissoes: Permissao[]) {
  if (permissoes.length === 0) {
    throw new Error('@RequerPermissao exige ao menos uma permissão');
  }
  return SetMetadata(PERM_METADATA_KEY, permissoes);
}
