import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { accountConfig, envSchema } from './env.schema';
import { PlataformaOrigem } from '../core/plataforma-origem.enum';

/** Parser mínimo de .env (KEY=VALUE, ignora comentários e linhas vazias). */
function parseDotenv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

const EXAMPLE_PATH = join(__dirname, '../../../.env.example');
const exampleEnv = parseDotenv(readFileSync(EXAMPLE_PATH, 'utf8'));

describe('envSchema', () => {
  it('o .env.example da raiz parseia sem erro', () => {
    expect(() => envSchema.parse(exampleEnv)).not.toThrow();
  });

  it('falha citando DATABASE_URL quando ausente', () => {
    const { DATABASE_URL: _omit, ...rest } = exampleEnv;
    const result = envSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('DATABASE_URL'))).toBe(true);
    }
  });

  it('falha citando PORT quando não numérico', () => {
    const result = envSchema.safeParse({ ...exampleEnv, PORT: 'abc' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('PORT'))).toBe(true);
    }
  });

  it('falha citando SERVICE_JWT_SECRET quando presente mas curto', () => {
    const result = envSchema.safeParse({ ...exampleEnv, SERVICE_JWT_SECRET: 'curto' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('SERVICE_JWT_SECRET'))).toBe(true);
    }
  });

  it('não falha quando TODAS as chaves de conta estão ausentes (opcionais na 001)', () => {
    const semContas: Record<string, string> = {};
    for (const [k, v] of Object.entries(exampleEnv)) {
      if (!/_(API_BASE_URL|API_KEY|WEBHOOK_TOKEN)$/.test(k)) semContas[k] = v;
    }
    expect(() => envSchema.parse(semContas)).not.toThrow();
  });

  it('falha citando a chave de conta quando a URL é inválida', () => {
    const result = envSchema.safeParse({ ...exampleEnv, TMB_API_BASE_URL: 'não-é-url' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('TMB_API_BASE_URL'))).toBe(true);
    }
  });

  it('exige TEST_DATABASE_URL quando NODE_ENV=test', () => {
    const { TEST_DATABASE_URL: _omit, ...rest } = exampleEnv;
    const result = envSchema.safeParse({ ...rest, NODE_ENV: 'test' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('TEST_DATABASE_URL'))).toBe(true);
    }
  });

  // --- spec 003: credenciais de serviço obrigatórias em TODO ambiente ---

  it.each(['SERVICE_JWT_SECRET', 'SERVICE_CLIENT_ID', 'SERVICE_CLIENT_SECRET'])(
    'falha citando %s quando ausente',
    (chave) => {
      const { [chave]: _omit, ...rest } = exampleEnv;
      const result = envSchema.safeParse(rest);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes(chave))).toBe(true);
      }
    },
  );

  it('SERVICE_JWT_TTL ausente → default 12h (43200 s)', () => {
    const { SERVICE_JWT_TTL: _omit, ...rest } = exampleEnv;
    const parsed = envSchema.parse(rest);
    expect(parsed.SERVICE_JWT_TTL).toBe(43_200);
  });

  it('SERVICE_JWT_TTL compacto é convertido para segundos', () => {
    expect(envSchema.parse({ ...exampleEnv, SERVICE_JWT_TTL: '90m' }).SERVICE_JWT_TTL).toBe(5_400);
  });

  it.each(['48h', '2d', '90000s'])('falha citando SERVICE_JWT_TTL acima do teto de 24h (%s)', (v) => {
    const result = envSchema.safeParse({ ...exampleEnv, SERVICE_JWT_TTL: v });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('SERVICE_JWT_TTL'))).toBe(true);
    }
  });

  it('falha citando SERVICE_JWT_TTL quando o formato é inválido', () => {
    const result = envSchema.safeParse({ ...exampleEnv, SERVICE_JWT_TTL: '12 horas' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('SERVICE_JWT_TTL'))).toBe(true);
    }
  });

  it('CORS_ORIGIN e RATE_LIMIT_* têm default quando ausentes', () => {
    const { CORS_ORIGIN: _c, RATE_LIMIT_WINDOW_MS: _w, RATE_LIMIT_MAX: _m, ...rest } = exampleEnv;
    const parsed = envSchema.parse(rest);
    expect(parsed.CORS_ORIGIN).toBe('http://localhost:5174');
    expect(parsed.RATE_LIMIT_WINDOW_MS).toBe(60_000);
    expect(parsed.RATE_LIMIT_MAX).toBe(10);
  });

  it('accountConfig agrupa as 3 chaves de uma conta e retorna undefined quando vazia', () => {
    const parsed = envSchema.parse(exampleEnv);
    const tmb = accountConfig(parsed, PlataformaOrigem.TMB);
    expect(tmb?.apiBaseUrl).toBe(exampleEnv.TMB_API_BASE_URL);

    const parsedSemContas = envSchema.parse(
      Object.fromEntries(
        Object.entries(exampleEnv).filter(
          ([k]) => !/_(API_BASE_URL|API_KEY|WEBHOOK_TOKEN)$/.test(k),
        ),
      ),
    );
    expect(accountConfig(parsedSemContas, PlataformaOrigem.TMB)).toBeUndefined();
  });
});
