import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  AUTENTICADO_BASTA_KEY,
  IS_PUBLIC_KEY,
  PERM_METADATA_KEY,
} from '../../auth.constants';
import { ehRotaPublicaPorPath } from '../../guards/public-routes';
import type { Permissao } from '../catalogo';
import { SujeitoRbacService } from '../sujeito-rbac.service';

/**
 * 2º `APP_GUARD` (roda **depois** do `JwtAuthGuard`, que já autenticou e pôs
 * `req.auth`). Política **fechada por omissão** (CL-03):
 *
 *  1. `@Public()` / allowlist de path → passa (não é assunto de permissão).
 *  2. `@AutenticadoBasta()` → passa (só exige JWT).
 *  3. `@RequerPermissao(a, b)` → sujeito precisa de **a e b**; senão **403**.
 *  4. Nenhum marcador e rota não-pública → **403** (sem-marcador-rbac).
 *
 * Todo 403 tem corpo genérico (`"permissão insuficiente"`); o motivo real
 * (qual permissão faltou) vai só para o log interno (SC-005).
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly sujeito: SujeitoRbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const alvo = [context.getHandler(), context.getClass()];

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, alvo);
    const req = context.switchToHttp().getRequest<Request>();
    if (isPublic || ehRotaPublicaPorPath(req.path)) return true;

    const autenticadoBasta = this.reflector.getAllAndOverride<boolean>(
      AUTENTICADO_BASTA_KEY,
      alvo,
    );
    if (autenticadoBasta) return true;

    const exigidas = this.reflector.getAllAndOverride<Permissao[] | undefined>(
      PERM_METADATA_KEY,
      alvo,
    );

    if (!exigidas || exigidas.length === 0) {
      this.logger.warn(
        `rbac.guard.reject rota=${req.method} ${req.path} motivo=sem-marcador-rbac`,
      );
      throw new ForbiddenException('permissão insuficiente');
    }

    const efetivas = await this.sujeito.permissoesDe(req);
    const faltando = exigidas.filter((p) => !efetivas.has(p));
    if (faltando.length > 0) {
      this.logger.warn(
        `rbac.guard.reject rota=${req.method} ${req.path} faltou=${faltando.join(',')}`,
      );
      throw new ForbiddenException('permissão insuficiente');
    }
    return true;
  }
}
