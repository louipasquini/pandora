import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../core/config';
import { PlataformaOrigem } from '../../core/plataforma-origem.enum';
import { WebhookAuthenticator } from './webhook-authenticator';

function makeAuth(over: Record<string, string> = {}): WebhookAuthenticator {
  const map: Record<string, string | undefined> = {
    GURU_PRD_WEBHOOK_TOKEN: 'segredo-guru-prd',
    ...over,
  };
  const cfg = { get: (k: string) => map[k] } as unknown as ConfigService<AppConfig, true>;
  return new WebhookAuthenticator(cfg);
}

describe('WebhookAuthenticator.autenticar', () => {
  it('token correto da conta → autenticado', () => {
    expect(makeAuth().autenticar(PlataformaOrigem.GURU_PRD, 'segredo-guru-prd')).toEqual({
      autenticado: true,
      conta: PlataformaOrigem.GURU_PRD,
    });
  });

  it('token errado → token_invalido', () => {
    expect(makeAuth().autenticar(PlataformaOrigem.GURU_PRD, 'errado')).toEqual({
      autenticado: false,
      motivo: 'token_invalido',
    });
  });

  it('token ausente → token_ausente', () => {
    expect(makeAuth().autenticar(PlataformaOrigem.GURU_PRD, undefined)).toEqual({
      autenticado: false,
      motivo: 'token_ausente',
    });
  });

  it('conta sem token configurado → sem_token_configurado', () => {
    expect(makeAuth().autenticar(PlataformaOrigem.GURU_SVC, 'segredo-guru-prd')).toEqual({
      autenticado: false,
      motivo: 'sem_token_configurado',
    });
    expect(makeAuth().autenticar(PlataformaOrigem.TMB, 'qualquer')).toEqual({
      autenticado: false,
      motivo: 'sem_token_configurado',
    });
  });

  it('token de outra conta não autentica (escopo por conta)', () => {
    const auth = makeAuth({ GURU_SVC_WEBHOOK_TOKEN: 'segredo-guru-svc' });
    expect(auth.autenticar(PlataformaOrigem.GURU_PRD, 'segredo-guru-svc')).toEqual({
      autenticado: false,
      motivo: 'token_invalido',
    });
  });

  it('comprimentos diferentes não lançam', () => {
    expect(() =>
      makeAuth().autenticar(PlataformaOrigem.GURU_PRD, 'x'),
    ).not.toThrow();
  });
});
