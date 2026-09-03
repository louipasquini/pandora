import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { AppConfig } from '../../core/config';

interface Janela {
  count: number;
  resetAt: number;
}

/**
 * Rate limiting **leve** de janela fixa em memória, por IP. Aplicado só ao
 * `AuthController` (`POST /auth/token`) para barrar força bruta trivial. Lockout
 * progressivo e store compartilhado são escopo da spec 055 (hardening) — este
 * contador é efêmero e reinicia a cada restart.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly janelas = new Map<string, Janela>();
  private readonly windowMs: number;
  private readonly max: number;

  constructor(config: ConfigService<AppConfig, true>) {
    this.windowMs = config.get('RATE_LIMIT_WINDOW_MS', { infer: true });
    this.max = config.get('RATE_LIMIT_MAX', { infer: true });
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const chave = req.ip ?? 'desconhecido';
    const agora = Date.now();

    let janela = this.janelas.get(chave);
    if (!janela || agora >= janela.resetAt) {
      janela = { count: 0, resetAt: agora + this.windowMs };
      this.janelas.set(chave, janela);
    }

    janela.count += 1;
    if (janela.count > this.max) {
      const retryAfter = Math.max(1, Math.ceil((janela.resetAt - agora) / 1000));
      context.switchToHttp().getResponse<Response>().setHeader('Retry-After', String(retryAfter));
      throw new HttpException(
        { statusCode: 429, error: 'Too Many Requests', message: 'muitas tentativas, aguarde' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
