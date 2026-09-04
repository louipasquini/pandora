import { ordenarFila } from './fila';

describe('ordenarFila', () => {
  it('ordena por prioridade decrescente', () => {
    const t0 = new Date('2026-09-04T10:00:00Z');
    const itens = [
      { id: 'normal', prioridade: 'NORMAL' as const, abertoEm: t0 },
      { id: 'urgente', prioridade: 'URGENTE' as const, abertoEm: t0 },
      { id: 'alta', prioridade: 'ALTA' as const, abertoEm: t0 },
    ];
    expect(ordenarFila(itens).map((i) => i.id)).toEqual(['urgente', 'alta', 'normal']);
  });

  it('dentro da mesma prioridade, FIFO por abertoEm', () => {
    const itens = [
      { id: 'mais-novo', prioridade: 'NORMAL' as const, abertoEm: new Date('2026-09-04T10:10:00Z') },
      { id: 'mais-antigo', prioridade: 'NORMAL' as const, abertoEm: new Date('2026-09-04T10:00:00Z') },
    ];
    expect(ordenarFila(itens).map((i) => i.id)).toEqual(['mais-antigo', 'mais-novo']);
  });

  it('não muta o array de entrada', () => {
    const itens = [
      { id: 'a', prioridade: 'NORMAL' as const, abertoEm: new Date('2026-09-04T10:10:00Z') },
      { id: 'b', prioridade: 'URGENTE' as const, abertoEm: new Date('2026-09-04T10:00:00Z') },
    ];
    const copia = [...itens];
    ordenarFila(itens);
    expect(itens).toEqual(copia);
  });
});
