import { Controller, Get } from '@nestjs/common';
import { AutenticadoBasta } from '../../src/auth/rbac/decorators/autenticado-basta.decorator';
import { RequerPermissao } from '../../src/auth/rbac/decorators/requer-permissao.decorator';

/**
 * Rotas-isca só para e2e (nunca entram no bundle de produção).
 *
 * - `protegida` — `@AutenticadoBasta()`: 401 sem token, 200 com token (regressão da 003).
 * - `perm` — `@RequerPermissao('lead:ver_todos')`: 200 admin / 403 sem a permissão / 401 sem token.
 * - `autenticado` — `@AutenticadoBasta()`: 200 para qualquer autenticado.
 * - `sem-marcador` — nenhum marcador: 403 mesmo autenticado (CL-03, fechado por omissão).
 */
@Controller('_probe')
export class ProbeController {
  @AutenticadoBasta()
  @Get('protegida')
  protegida(): { ok: true } {
    return { ok: true };
  }

  @RequerPermissao('lead:ver_todos')
  @Get('perm')
  perm(): { ok: true } {
    return { ok: true };
  }

  @AutenticadoBasta()
  @Get('autenticado')
  autenticado(): { ok: true } {
    return { ok: true };
  }

  @Get('sem-marcador')
  semMarcador(): { ok: true } {
    return { ok: true };
  }
}
