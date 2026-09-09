import { validarTransicao, ehTerminal } from './transicao-status';

describe('validarTransicao (spec 016)', () => {
  it('permite PENDENTE -> EM_ANDAMENTO, CONCLUIDA e CANCELADA', () => {
    expect(validarTransicao('PENDENTE', 'EM_ANDAMENTO').ok).toBe(true);
    expect(validarTransicao('PENDENTE', 'CONCLUIDA').ok).toBe(true);
    expect(validarTransicao('PENDENTE', 'CANCELADA').ok).toBe(true);
  });

  it('permite EM_ANDAMENTO -> PENDENTE, CONCLUIDA e CANCELADA', () => {
    expect(validarTransicao('EM_ANDAMENTO', 'PENDENTE').ok).toBe(true);
    expect(validarTransicao('EM_ANDAMENTO', 'CONCLUIDA').ok).toBe(true);
    expect(validarTransicao('EM_ANDAMENTO', 'CANCELADA').ok).toBe(true);
  });

  it('permite reabrir CONCLUIDA -> PENDENTE, e só isso', () => {
    expect(validarTransicao('CONCLUIDA', 'PENDENTE').ok).toBe(true);
    expect(validarTransicao('CONCLUIDA', 'EM_ANDAMENTO').ok).toBe(false);
    expect(validarTransicao('CONCLUIDA', 'CANCELADA').ok).toBe(false);
  });

  it('CANCELADA é terminal — nenhuma transição de saída', () => {
    expect(validarTransicao('CANCELADA', 'PENDENTE').ok).toBe(false);
    expect(validarTransicao('CANCELADA', 'EM_ANDAMENTO').ok).toBe(false);
    expect(validarTransicao('CANCELADA', 'CONCLUIDA').ok).toBe(false);
  });

  it('mesmo estado -> mesmo estado é sempre inválido', () => {
    expect(validarTransicao('PENDENTE', 'PENDENTE').ok).toBe(false);
    expect(validarTransicao('CONCLUIDA', 'CONCLUIDA').ok).toBe(false);
  });

  it('ehTerminal', () => {
    expect(ehTerminal('CONCLUIDA')).toBe(true);
    expect(ehTerminal('CANCELADA')).toBe(true);
    expect(ehTerminal('PENDENTE')).toBe(false);
    expect(ehTerminal('EM_ANDAMENTO')).toBe(false);
  });
});
