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

  function runMainWithoutDatabaseUrl(): { code: number; output: string } {
    try {
      const output = execFileSync(
        'npx',
        ['ts-node', '--transpile-only', 'src/main.ts'],
        {
          cwd: backendDir,
          shell: process.platform === 'win32',
          timeout: 60000,
          encoding: 'utf8',
          env: {
            PATH: process.env.PATH,
            SystemRoot: process.env.SystemRoot,
            HOME: process.env.HOME,
            USERPROFILE: process.env.USERPROFILE,
            APPDATA: process.env.APPDATA,
            PANDORA_IGNORE_ENV_FILE: '1',
            NODE_ENV: 'development',
            PORT: '3999',
            // DATABASE_URL deliberadamente ausente
          },
        },
      );
      return { code: 0, output };
    } catch (err) {
      const e = err as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
      return {
        code: e.status ?? 1,
        output: `${e.stdout ?? ''}${e.stderr ?? ''}`,
      };
    }
  }

  it('aborta com exit ≠ 0 e cita DATABASE_URL', () => {
    const { code, output } = runMainWithoutDatabaseUrl();
    expect(code).not.toBe(0);
    expect(output).toMatch(/DATABASE_URL/);
  });
});
