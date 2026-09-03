import { ArgumentsHost, Catch, ExceptionFilter, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import {
  JWT_ALGORITHMS,
  JWT_CLOCK_TOLERANCE_S,
  JWT_ISSUER,
} from '../auth.constants';
import { ehRotaPublicaPorPath } from '../guards/public-routes';

const ROTAS_PUBLICAS_EXATAS = new Set(['/health', '/auth/token']);
const BEARER_RE = /^Bearer[ \t]+(.+)$/i;

/**
 * O `JwtAuthGuard` só roda em rotas **casadas**; um path inexistente vira 404
 * antes de qualquer guard. FR-012: quem não está autenticado não deve nem
 * confirmar a existência de rotas protegidas. Este filtro converte o 404 em
 * **401** quando a requisição não traz um token válido e o path não está na
 * allowlist. Com token válido, um path inexistente segue 404.
 */
@Catch(NotFoundException)
export class NotFoundAuthFilter implements ExceptionFilter {
  constructor(private readonly jwt: JwtService) {}

  async catch(_ex: NotFoundException, host: ArgumentsHost): Promise<void> {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const publico =
      ROTAS_PUBLICAS_EXATAS.has(req.path) || ehRotaPublicaPorPath(req.path);

    if (!publico && !(await this.temTokenValido(req))) {
      res
        .status(401)
        .json({ statusCode: 401, error: 'Unauthorized', message: 'não autenticado' });
      return;
    }
    res.status(404).json({ statusCode: 404, error: 'Not Found', message: 'Not Found' });
  }

  private async temTokenValido(req: Request): Promise<boolean> {
    const raw = req.headers.authorization;
    if (typeof raw !== 'string') return false;
    const token = BEARER_RE.exec(raw.trim())?.[1]?.trim();
    if (!token) return false;
    try {
      await this.jwt.verifyAsync(token, {
        issuer: JWT_ISSUER,
        algorithms: [...JWT_ALGORITHMS],
        clockTolerance: JWT_CLOCK_TOLERANCE_S,
      });
      return true;
    } catch {
      return false;
    }
  }
}
