import { detectarCiclo } from './dependencia';

describe('detectarCiclo (spec 016, research.md D-R5)', () => {
  it('auto-dependência é sempre ciclo', () => {
    expect(detectarCiclo([], { tarefaId: 'A', dependeDeId: 'A' })).toBe(true);
  });

  it('sem arestas existentes, uma nova aresta simples não é ciclo', () => {
    expect(detectarCiclo([], { tarefaId: 'B', dependeDeId: 'A' })).toBe(false);
  });

  it('detecta ciclo direto (A depende de B, tentando B depender de A)', () => {
    const existentes = [{ tarefaId: 'A', dependeDeId: 'B' }];
    expect(detectarCiclo(existentes, { tarefaId: 'B', dependeDeId: 'A' })).toBe(true);
  });

  it('detecta ciclo indireto A->B->C->A', () => {
    const existentes = [
      { tarefaId: 'A', dependeDeId: 'B' },
      { tarefaId: 'B', dependeDeId: 'C' },
    ];
    expect(detectarCiclo(existentes, { tarefaId: 'C', dependeDeId: 'A' })).toBe(true);
  });

  it('grafo em diamante sem ciclo não acusa falso positivo', () => {
    const existentes = [
      { tarefaId: 'D', dependeDeId: 'B' },
      { tarefaId: 'D', dependeDeId: 'C' },
      { tarefaId: 'B', dependeDeId: 'A' },
      { tarefaId: 'C', dependeDeId: 'A' },
    ];
    expect(detectarCiclo(existentes, { tarefaId: 'E', dependeDeId: 'D' })).toBe(false);
  });
});
