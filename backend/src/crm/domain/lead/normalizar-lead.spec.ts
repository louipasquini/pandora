import {
  normalizarNome,
  normalizarOrigem,
  normalizarEmail,
  normalizarTelefone,
  normalizarDocumento,
  normalizarTag,
  normalizarTags,
} from './normalizar-lead';

describe('normalizar-lead', () => {
  it('nome: trim + colapsa espaço; vazio → erro', () => {
    expect(normalizarNome('  Ana   Nutri ')).toEqual({ valor: 'Ana Nutri' });
    expect(normalizarNome('   ')).toEqual({ erro: 'vazio' });
  });

  it('origem: slug; vazio → null', () => {
    expect(normalizarOrigem('Formulário LP!')).toBe('formulrio_lp');
    expect(normalizarOrigem('  ')).toBeNull();
  });

  it('email: lowercase + trim + forma', () => {
    expect(normalizarEmail('  Ana@Ex.COM ')).toEqual({ valor: 'ana@ex.com' });
    expect(normalizarEmail('sem-arroba')).toEqual({ erro: 'forma inválida' });
  });

  it('telefone: E.164, +55 na borda', () => {
    expect(normalizarTelefone('(11) 99888-7777')).toEqual({ valor: '+5511998887777' });
    expect(normalizarTelefone('11988887777')).toEqual({ valor: '+5511988887777' });
    expect(normalizarTelefone('+44 20 7946 0958')).toEqual({ valor: '+442079460958' });
    expect(normalizarTelefone('123').erro).toMatch(/implausível/);
  });

  it('documento: DV de CPF/CNPJ', () => {
    expect(normalizarDocumento('390.533.447-05')).toEqual({ valor: '39053344705' });
    expect(normalizarDocumento('111.111.111-11')).toEqual({
      erro: 'DV inválido ou comprimento inesperado',
    });
    expect(normalizarDocumento('11.222.333/0001-81')).toEqual({ valor: '11222333000181' });
  });

  it('tag: lowercase, espaço→-, dedupe; vazia → erro', () => {
    expect(normalizarTag('  Webinar Out ')).toEqual({ valor: 'webinar-out' });
    expect(normalizarTag('  !! ')).toEqual({ erro: 'tag vazia após normalizar' });
    expect(normalizarTags(['A', 'a', 'B'])).toEqual({ valor: ['a', 'b'] });
    expect(normalizarTags(['ok', '  '])).toEqual({ erro: 'tag vazia após normalizar' });
  });
});
