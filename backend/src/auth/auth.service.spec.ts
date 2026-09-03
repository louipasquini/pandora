import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { verify } from 'jsonwebtoken';
import type { AppConfig } from '../core/config';
import { JWT_ISSUER } from './auth.constants';
import { AuthService } from './auth.service';

const SECRET = 'segredo-de-teste-com-mais-de-32-caracteres!!';
const TTL = 43_200;

function makeConfig(over: Partial<Record<keyof AppConfig, unknown>> = {}) {
  const map: Record<string, unknown> = {
    SERVICE_CLIENT_ID: 'pandora-panel',
    SERVICE_CLIENT_SECRET: 'client-secret-16chars',
    SERVICE_JWT_SECRET: SECRET,
    SERVICE_JWT_TTL: TTL,
    ...over,
  };
  return { get: (k: string) => map[k] } as unknown as ConfigService<AppConfig, true>;
}

function makeService(cfg = makeConfig()): AuthService {
  const jwt = new JwtService({
    secret: SECRET,
    signOptions: { issuer: JWT_ISSUER, expiresIn: TTL },
  });
  return new AuthService(jwt, cfg);
}

describe('AuthService.emitirToken', () => {
  it('par correto → token verificável, claims corretos, exp-iat === TTL', async () => {
    const res = await makeService().emitirToken('pandora-panel', 'client-secret-16chars');
    expect(res.token_type).toBe('Bearer');
    expect(res.expires_in).toBe(TTL);

    const decoded = verify(res.access_token, SECRET) as {
      sub: string;
      iss: string;
      iat: number;
      exp: number;
    };
    expect(decoded.sub).toBe('pandora-panel');
    expect(decoded.iss).toBe(JWT_ISSUER);
    expect(decoded.exp - decoded.iat).toBe(TTL);
  });

  it.each([
    ['client_id errado', 'errado', 'client-secret-16chars'],
    ['client_secret errado', 'pandora-panel', 'errado'],
    ['ambos errados', 'x', 'y'],
  ])('%s → UnauthorizedException genérica', async (_caso, id, secret) => {
    const svc = makeService();
    await expect(svc.emitirToken(id, secret)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(svc.emitirToken(id, secret)).rejects.toThrow('credenciais inválidas');
  });

  it('a exceção nunca contém o secret configurado', async () => {
    const svc = makeService();
    try {
      await svc.emitirToken('pandora-panel', 'errado');
      fail('deveria ter lançado');
    } catch (e) {
      expect(JSON.stringify(e)).not.toContain('client-secret-16chars');
      expect((e as Error).message).not.toContain('client-secret-16chars');
    }
  });
});
