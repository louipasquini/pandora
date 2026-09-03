import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { sign } from 'jsonwebtoken';
import { JWT_ISSUER } from '../auth.constants';
import { JwtAuthGuard } from './jwt-auth.guard';

const SECRET = 'segredo-de-teste-com-mais-de-32-caracteres!!';

function token(opts: { secret?: string; expiresIn?: number; issuer?: string } = {}): string {
  return sign({}, opts.secret ?? SECRET, {
    subject: 'pandora-panel',
    issuer: opts.issuer ?? JWT_ISSUER,
    expiresIn: opts.expiresIn ?? 3600,
  });
}

function makeGuard(isPublic = false): JwtAuthGuard {
  const reflector = { getAllAndOverride: () => isPublic } as unknown as Reflector;
  const jwt = new JwtService({ secret: SECRET });
  return new JwtAuthGuard(reflector, jwt);
}

function ctxFor(req: Partial<{
  path: string;
  method: string;
  headers: Record<string, string>;
  rawHeaders: string[];
}>): { ctx: ExecutionContext; req: Record<string, unknown> } {
  const r: Record<string, unknown> = {
    path: req.path ?? '/x',
    method: req.method ?? 'GET',
    headers: req.headers ?? {},
    rawHeaders:
      req.rawHeaders ??
      Object.entries(req.headers ?? {}).flatMap(([k, v]) => [k, v as string]),
  };
  const ctx = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => r }),
  } as unknown as ExecutionContext;
  return { ctx, req: r };
}

describe('JwtAuthGuard', () => {
  it('@Public() → passa sem header', async () => {
    const { ctx } = ctxFor({});
    await expect(makeGuard(true).canActivate(ctx)).resolves.toBe(true);
  });

  it('prefixo /webhooks/ → passa sem header', async () => {
    const { ctx } = ctxFor({ path: '/webhooks/guru/prd' });
    await expect(makeGuard().canActivate(ctx)).resolves.toBe(true);
  });

  it('header ausente → 401', async () => {
    const { ctx } = ctxFor({});
    await expect(makeGuard().canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each([
    ['sem esquema Bearer', { authorization: token() }],
    ['esquema errado', { authorization: `Basic ${token()}` }],
    ['token vazio', { authorization: 'Bearer ' }],
  ])('%s → 401', async (_caso, headers) => {
    const { ctx } = ctxFor({ headers });
    await expect(makeGuard().canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('Authorization duplicado (rawHeaders) → 401', async () => {
    const t = token();
    const { ctx } = ctxFor({
      headers: { authorization: t },
      rawHeaders: ['Authorization', t, 'Authorization', t],
    });
    await expect(makeGuard().canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('Bearer com caixa/espaços diferentes + token válido → passa e popula req.auth', async () => {
    const { ctx, req } = ctxFor({ headers: { authorization: `bEaReR   ${token()}` } });
    await expect(makeGuard().canActivate(ctx)).resolves.toBe(true);
    expect((req.auth as { sub: string }).sub).toBe('pandora-panel');
  });

  it('token expirado → 401', async () => {
    const { ctx } = ctxFor({ headers: { authorization: `Bearer ${token({ expiresIn: -120 })}` } });
    await expect(makeGuard().canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('token assinado com outro segredo → 401', async () => {
    const bad = token({ secret: 'x'.repeat(40) });
    const { ctx } = ctxFor({ headers: { authorization: `Bearer ${bad}` } });
    await expect(makeGuard().canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('emissor errado → 401', async () => {
    const { ctx } = ctxFor({ headers: { authorization: `Bearer ${token({ issuer: 'outro' })}` } });
    await expect(makeGuard().canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('mensagem de erro é genérica (não vaza causa)', async () => {
    const { ctx } = ctxFor({ headers: { authorization: `Bearer ${token({ expiresIn: -120 })}` } });
    await expect(makeGuard().canActivate(ctx)).rejects.toThrow('não autenticado');
  });
});
