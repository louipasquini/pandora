import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * FR-008 / SC-006: iniciar o backend sem uma variável obrigatória resulta em
 * falha imediata que NOMEIA a variável — nunca um start "saudável".
 *
 * Sobe o `src/main.ts` de verdade via ts-node, com env mínima e sem
 * DATABASE_URL, e afirma exit ≠ 0 + a chave citada no output.
 */
describe('bootstrap fail-fast', () => {
  const backendDir = join(__dirname, '..');

  /** Env base "quase completa" — sobrescreva/omita chaves para testar a falha. */
  const ENV_BASE: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    SystemRoot: process.env.SystemRoot ?? '',
    HOME: process.env.HOME ?? '',
    USERPROFILE: process.env.USERPROFILE ?? '',
    APPDATA: process.env.APPDATA ?? '',
    PANDORA_IGNORE_ENV_FILE: '1',
    NODE_ENV: 'development',
    PORT: '3999',
    DATABASE_URL: 'postgres://u:p@localhost:1/x',
    SERVICE_JWT_SECRET: 'x'.repeat(40),
    SERVICE_CLIENT_ID: 'pandora-panel',
    SERVICE_CLIENT_SECRET: 'y'.repeat(20),
  };

  function runMain(env: Record<string, string>): { code: number; output: string } {
    try {
      const output = execFileSync('npx', ['ts-node', '--transpile-only', 'src/main.ts'], {
        cwd: backendDir,
        shell: process.platform === 'win32',
        timeout: 60000,
        encoding: 'utf8',
        env,
      });
      return { code: 0, output };
    } catch (err) {
      const e = err as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
      return { code: e.status ?? 1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
    }
  }

  function runMainSem(chave: string): { code: number; output: string } {
    const { [chave]: _omit, ...env } = ENV_BASE;
    return runMain(env);
  }

  it('aborta com exit ≠ 0 e cita DATABASE_URL', () => {
    const { code, output } = runMainSem('DATABASE_URL');
    expect(code).not.toBe(0);
    expect(output).toMatch(/DATABASE_URL/);
  });

  it.each(['SERVICE_JWT_SECRET', 'SERVICE_CLIENT_ID', 'SERVICE_CLIENT_SECRET'])(
    'aborta com exit ≠ 0 e cita %s quando ausente (obrigatória a partir da 003)',
    (chave) => {
      const { code, output } = runMainSem(chave);
      expect(code).not.toBe(0);
      expect(output).toContain(chave);
    },
  );
});
