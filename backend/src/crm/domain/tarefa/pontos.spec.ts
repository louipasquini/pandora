import { calcularPontosTarefa, PESOS_PONTOS_TAREFA } from './pontos';

describe('calcularPontosTarefa (spec 016, CL-01)', () => {
  it('tarefa não concluída não pontua', () => {
    expect(
      calcularPontosTarefa({
        concluida: false,
        dataVencimento: null,
        concluidoEm: null,
        totalChecklist: 0,
        checklistConcluidos: 0,
      }),
    ).toBe(0);
  });

  it('conclusão simples, sem prazo nem checklist, dá só os pontos-base', () => {
    expect(
      calcularPontosTarefa({
        concluida: true,
        dataVencimento: null,
        concluidoEm: new Date(),
        totalChecklist: 0,
        checklistConcluidos: 0,
      }),
    ).toBe(PESOS_PONTOS_TAREFA.base);
  });

  it('concluída no prazo ganha o bônus de prazo', () => {
    expect(
      calcularPontosTarefa({
        concluida: true,
        dataVencimento: new Date('2026-09-10T00:00:00Z'),
        concluidoEm: new Date('2026-09-09T00:00:00Z'),
        totalChecklist: 0,
        checklistConcluidos: 0,
      }),
    ).toBe(PESOS_PONTOS_TAREFA.base + PESOS_PONTOS_TAREFA.bonusNoPrazo);
  });

  it('concluída depois do prazo não ganha o bônus', () => {
    expect(
      calcularPontosTarefa({
        concluida: true,
        dataVencimento: new Date('2026-09-09T00:00:00Z'),
        concluidoEm: new Date('2026-09-10T00:00:00Z'),
        totalChecklist: 0,
        checklistConcluidos: 0,
      }),
    ).toBe(PESOS_PONTOS_TAREFA.base);
  });

  it('checklist 100% concluído ganha o bônus de checklist', () => {
    expect(
      calcularPontosTarefa({
        concluida: true,
        dataVencimento: null,
        concluidoEm: new Date(),
        totalChecklist: 3,
        checklistConcluidos: 3,
      }),
    ).toBe(PESOS_PONTOS_TAREFA.base + PESOS_PONTOS_TAREFA.bonusChecklistCompleto);
  });

  it('checklist incompleto não ganha o bônus', () => {
    expect(
      calcularPontosTarefa({
        concluida: true,
        dataVencimento: null,
        concluidoEm: new Date(),
        totalChecklist: 3,
        checklistConcluidos: 2,
      }),
    ).toBe(PESOS_PONTOS_TAREFA.base);
  });

  it('acumula os dois bônus quando ambos se aplicam', () => {
    expect(
      calcularPontosTarefa({
        concluida: true,
        dataVencimento: new Date('2026-09-10T00:00:00Z'),
        concluidoEm: new Date('2026-09-09T00:00:00Z'),
        totalChecklist: 2,
        checklistConcluidos: 2,
      }),
    ).toBe(
      PESOS_PONTOS_TAREFA.base + PESOS_PONTOS_TAREFA.bonusNoPrazo + PESOS_PONTOS_TAREFA.bonusChecklistCompleto,
    );
  });
});
