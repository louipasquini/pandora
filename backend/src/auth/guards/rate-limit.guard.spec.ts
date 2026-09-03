import { ExecutionContext, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../core/config';
import { RateLimitGuard } from './rate-limit.guard';

const WINDOW = 60_000;
const MAX = 3;

function makeGuard(): RateLimitGuard {
  const cfg = {
    get: (k: string) => (k === 'RATE_LIMIT_WINDOW_MS' ? WINDOW : MAX),
  } as unknown as ConfigService<AppConfig, true>;
  return new RateLimitGuard(cfg);
}

function ctxFor(ip: string): { ctx: ExecutionContext; headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  const res = { setHeader: (k: string, v: string) => (headers[k] = v) };
  const ctx = {
    switchToHttp: () => ({
      getRequest: () => ({ ip }),
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
  return { ctx, headers };
}

describe('RateLimitGuard', () => {
  it('deixa passar até o limite e bloqueia o excedente com 429 + Retry-After', () => {
    const guard = makeGuard();
    const { ctx, headers } = ctxFor('10.0.0.1');
    for (let i = 0; i < MAX; i++) expect(guard.canActivate(ctx)).toBe(true);

    try {
      guard.canActivate(ctx);
      fail('deveria ter bloqueado');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(429);
      expect(Number(headers['Retry-After'])).toBeGreaterThanOrEqual(1);
    }
  });

  it('conta cada IP separadamente', () => {
    const guard = makeGuard();
    for (let i = 0; i < MAX; i++) expect(guard.canActivate(ctxFor('1.1.1.1').ctx)).toBe(true);
    expect(guard.canActivate(ctxFor('2.2.2.2').ctx)).toBe(true);
  });

  it('a janela reabre após WINDOW_MS', () => {
    jest.useFakeTimers();
    try {
      const guard = makeGuard();
      const { ctx } = ctxFor('3.3.3.3');
      for (let i = 0; i < MAX; i++) guard.canActivate(ctx);
      expect(() => guard.canActivate(ctx)).toThrow(HttpException);

      jest.advanceTimersByTime(WINDOW + 1);
      expect(guard.canActivate(ctx)).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
