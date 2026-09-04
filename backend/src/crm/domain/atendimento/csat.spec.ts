import { csatElegivel, interpretarRespostaCsat } from './csat';

describe('csatElegivel', () => {
  it('encerrado + solicitado + sem resposta prévia é elegível', () => {
    expect(
      csatElegivel({ status: 'ENCERRADO', csatSolicitadoEm: new Date() }, false),
    ).toBe(true);
  });

  it('não encerrado nunca é elegível', () => {
    expect(
      csatElegivel({ status: 'EM_ATENDIMENTO', csatSolicitadoEm: new Date() }, false),
    ).toBe(false);
  });

  it('sem csatSolicitadoEm não é elegível', () => {
    expect(csatElegivel({ status: 'ENCERRADO', csatSolicitadoEm: null }, false)).toBe(false);
  });

  it('já respondido não é elegível de novo', () => {
    expect(
      csatElegivel({ status: 'ENCERRADO', csatSolicitadoEm: new Date() }, true),
    ).toBe(false);
  });
});

describe('interpretarRespostaCsat', () => {
  it.each(['0', '5', '10', ' 9 ', '8.', '7!'])('reconhece "%s" como nota válida', (texto) => {
    expect(interpretarRespostaCsat(texto)).not.toBeNull();
  });

  it('interpreta corretamente o valor numérico', () => {
    expect(interpretarRespostaCsat('9')).toBe(9);
    expect(interpretarRespostaCsat(' 10 ')).toBe(10);
    expect(interpretarRespostaCsat('0')).toBe(0);
  });

  it.each(['11', '-1', 'nota 7', 'ótimo atendimento', '', '9.5', 'dez'])(
    'não reconhece "%s" como nota (vira interação comum)',
    (texto) => {
      expect(interpretarRespostaCsat(texto)).toBeNull();
    },
  );
});
