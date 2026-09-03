import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import {
  IS_PUBLIC_KEY,
  JWT_ALGORITHMS,
  JWT_CLOCK_TOLERANCE_S,
  JWT_ISSUER,
} from '../auth.constants';
import { ehRotaPublicaPorPath } from './public-routes';

/** Anexado a `req.auth` quando o token é válido. */
export interface AuthContext {
  sub: string;
  iat: number;
  exp: number;
}

const BEARER_RE = /^Bearer[ \t]+(.+)$/i;

/**
 * Guard global (`APP_GUARD`) — fecha a API por padrão (FR-008..FR-013).
 *
 * Ordem: `@Public()` (handler ou classe) → allowlist por prefixo de path →
 * validação do `Authorization: Bearer <jwt>`. Toda falha vira **401 de corpo
 * genérico**; o motivo real ("expired" / "signature" / "malformed") só vai para
 * o log interno (nunca no corpo — SC-005).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    if (ehRotaPublicaPorPath(req.path)) return true;

    const token = this.extrairToken(req);
    try {
      const payload = await this.jwt.verifyAsync<AuthContext & Record<string, unknown>>(token, {
        issuer: JWT_ISSUER,
        algorithms: [...JWT_ALGORITHMS],
        clockTolerance: JWT_CLOCK_TOLERANCE_S,
      });
      if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') {
        throw new Error('claims obrigatórios ausentes');
      }
      (req as Request & { auth?: AuthContext }).auth = {
        sub: payload.sub,
        iat: Number(payload.iat),
        exp: payload.exp,
      };
      return true;
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err);
      this.logger.warn(`auth.guard.reject rota=${req.method} ${req.path} motivo=${motivo}`);
      throw new UnauthorizedException('não autenticado');
    }
  }

  private extrairToken(req: Request): string {
    // Node mantém só o 1º `Authorization` em `req.headers`; para detectar
    // repetição olhamos os headers crus (índices pares = nomes).
    let ocorrencias = 0;
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      if (req.rawHeaders[i].toLowerCase() === 'authorization') ocorrencias += 1;
    }
    const raw = req.headers.authorization;
    if (raw === undefined || Array.isArray(raw) || ocorrencias > 1) {
      const motivo = ocorrencias > 1 ? 'header duplicado' : 'header ausente';
      this.logger.warn(`auth.guard.reject rota=${req.method} ${req.path} motivo=${motivo}`);
      throw new UnauthorizedException('não autenticado');
    }
    const m = BEARER_RE.exec(raw.trim());
    const token = m?.[1]?.trim();
    if (!token) {
      this.logger.warn(`auth.guard.reject rota=${req.method} ${req.path} motivo=esquema Bearer inválido`);
      throw new UnauthorizedException('não autenticado');
    }
    return token;
  }
}
