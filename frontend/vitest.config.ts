import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Sem limite, o Vitest sobe até 1 thread por núcleo simultaneamente — já visto
// travar a máquina inteira (RAM+swap esgotados). `50%` escala com o hardware
// de quem rodar (lido em JS, funciona igual em Windows/macOS/Linux); para
// forçar um número fixo, defina `VITEST_MAX_WORKERS` (ex.: `VITEST_MAX_WORKERS=2`).
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: true,
      maxWorkers: process.env.VITEST_MAX_WORKERS || '50%',
    },
  }),
);
