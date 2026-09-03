import { accountConfig, type AppConfig } from './index';
import { PlataformaOrigem } from '../plataforma-origem.enum';

/**
 * Garante que o contrato de config é consumível a partir do `core` (não de
 * `src/config` direto) e que a semântica da 001 foi preservada.
 */
describe('core/config (contrato re-exportado)', () => {
  it('accountConfig devolve undefined quando a conta não tem nenhuma chave', () => {
    const cfg = { NODE_ENV: 'test', PORT: 3001 } as unknown as AppConfig;
    expect(accountConfig(cfg, PlataformaOrigem.GURU_PRD)).toBeUndefined();
  });

  it('accountConfig agrupa as 3 chaves quando presentes', () => {
    const cfg = {
      GURU_PRD_API_BASE_URL: 'https://api.exemplo.invalido/',
      GURU_PRD_API_KEY: 'k',
      GURU_PRD_WEBHOOK_TOKEN: 't',
    } as unknown as AppConfig;

    expect(accountConfig(cfg, PlataformaOrigem.GURU_PRD)).toEqual({
      apiBaseUrl: 'https://api.exemplo.invalido/',
      apiKey: 'k',
      webhookToken: 't',
    });
  });
});
