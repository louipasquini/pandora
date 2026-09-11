import { projetarOferta, projetarProduto, turmaEfetivaDeOferta } from './projecao';

const baseProduto = {
  id: 'p1',
  codigo: 'PCS',
  criadoEm: new Date(),
  atualizadoEm: new Date(),
  camposEditados: [] as string[],
};

describe('projetarProduto', () => {
  it('curado vence sobre derivado', () => {
    const p = projetarProduto({
      ...baseProduto,
      nomeCurado: 'Curado',
      nomeDerivado: 'Derivado',
      assinaturaCurada: null,
      assinaturaDerivada: false,
    });
    expect(p.nome).toBe('Curado');
    expect(p.assinatura).toBe(false);
  });

  it('sem nenhum dos dois -> null', () => {
    const p = projetarProduto({
      ...baseProduto,
      nomeCurado: null,
      nomeDerivado: null,
      assinaturaCurada: null,
      assinaturaDerivada: null,
    });
    expect(p.nome).toBeNull();
    expect(p.assinatura).toBeNull();
  });
});

const baseOferta = {
  id: 'o1',
  produtoId: 'p1',
  camposEditados: [] as string[],
  criadoEm: new Date(),
  atualizadoEm: new Date(),
  subprodutoCodigoCurado: null,
  subprodutoCodigoDerivado: null,
  modeloCobrancaCodigoCurado: null,
  modeloCobrancaCodigoDerivado: null,
  modeloTransacaoCodigoCurado: null,
  modeloTransacaoCodigoDerivado: null,
};

describe('turmaEfetivaDeOferta', () => {
  it('curado (tipo+número) vence, mesmo com derivado presente', () => {
    const t = turmaEfetivaDeOferta({
      ...baseOferta,
      turmaTipoCurado: 'EVERGREEN',
      turmaNumeroCurado: null,
      turmaTipoDerivado: 'NUMERO',
      turmaNumeroDerivado: 48,
    });
    expect(t).toEqual({ tipo: 'EVERGREEN', numero: null });
  });

  it('nunca mistura tipo curado com número derivado', () => {
    const t = turmaEfetivaDeOferta({
      ...baseOferta,
      turmaTipoCurado: 'NUMERO',
      turmaNumeroCurado: 50,
      turmaTipoDerivado: 'NUMERO',
      turmaNumeroDerivado: 48,
    });
    expect(t).toEqual({ tipo: 'NUMERO', numero: 50 });
  });

  it('cai para derivado quando não há curado', () => {
    const t = turmaEfetivaDeOferta({
      ...baseOferta,
      turmaTipoCurado: null,
      turmaNumeroCurado: null,
      turmaTipoDerivado: 'NUMERO',
      turmaNumeroDerivado: 48,
    });
    expect(t).toEqual({ tipo: 'NUMERO', numero: 48 });
  });

  it('nenhum dos dois -> tipo/numero null', () => {
    const t = turmaEfetivaDeOferta({
      ...baseOferta,
      turmaTipoCurado: null,
      turmaNumeroCurado: null,
      turmaTipoDerivado: null,
      turmaNumeroDerivado: null,
    });
    expect(t).toEqual({ tipo: null, numero: null });
  });
});

describe('projetarOferta', () => {
  it('projeta turma + códigos de 1 caractere', () => {
    const o = projetarOferta({
      ...baseOferta,
      turmaTipoCurado: null,
      turmaNumeroCurado: null,
      turmaTipoDerivado: 'NUMERO',
      turmaNumeroDerivado: 48,
      subprodutoCodigoDerivado: 'X',
      modeloCobrancaCodigoDerivado: 'A',
      modeloTransacaoCodigoDerivado: 'V',
    });
    expect(o.turma).toEqual({ tipo: 'NUMERO', numero: 48 });
    expect(o.subprodutoCodigo).toBe('X');
    expect(o.modeloCobrancaCodigo).toBe('A');
    expect(o.modeloTransacaoCodigo).toBe('V');
  });
});
