import { sign } from 'jsonwebtoken';
import { JWT_ISSUER } from '../../src/auth/auth.constants';

/**
 * Helper de teste: assina um JWT de serviço válido (mesmo segredo/emissor do
 * `AuthModule`). Para as specs desta feature e as futuras que baterem em rotas
 * protegidas.
 */
export function issueTestToken(
  overrides: { secret?: string; subject?: string; issuer?: string; expiresIn?: number } = {},
): string {
  const secret = overrides.secret ?? process.env.SERVICE_JWT_SECRET;
  if (!secret) throw new Error('SERVICE_JWT_SECRET ausente no ambiente de teste');
  return sign({}, secret, {
    subject: overrides.subject ?? process.env.SERVICE_CLIENT_ID ?? 'pandora-panel',
    issuer: overrides.issuer ?? JWT_ISSUER,
    expiresIn: overrides.expiresIn ?? 3600,
  });
}

/** `{ Authorization: 'Bearer <token>' }` — usa um token novo se nenhum for dado. */
export function authHeader(token?: string): { Authorization: string } {
  return { Authorization: `Bearer ${token ?? issueTestToken()}` };
}
