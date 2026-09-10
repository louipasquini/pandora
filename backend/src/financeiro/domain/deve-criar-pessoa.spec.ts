import { Classificacao } from '@prisma/client';
import { deveCriarPessoa } from './deve-criar-pessoa';

describe('financeiro/domain · deveCriarPessoa', () => {
  it('VENDA_AFILIADA → false (Regra Inviolável nº 8)', () => {
    expect(deveCriarPessoa(Classificacao.VENDA_AFILIADA)).toBe(false);
  });

  it('demais classificações → true', () => {
    for (const c of [
      Classificacao.VENDA_PROPRIA,
      Classificacao.COBRANCA_TERCEIRIZADA,
      Classificacao.REEMBOLSO,
      Classificacao.RECORRENCIA,
      Classificacao.OUTRO,
      Classificacao.DESCONHECIDO,
    ]) {
      expect(deveCriarPessoa(c)).toBe(true);
    }
  });

  it('valor não reconhecido → true (permissivo — só a afiliada é proibida)', () => {
    expect(deveCriarPessoa('QUALQUER_COISA')).toBe(true);
  });
});
