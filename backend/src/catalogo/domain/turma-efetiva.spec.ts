import { turmaEfetiva } from './turma-efetiva';

const janela = (rotulo: string, inicio: string, fim: string) => ({
  rotulo,
  inicio: new Date(inicio),
  fim: new Date(fim),
});

describe('turmaEfetiva', () => {
  const janelas = [
    janela('Turma 48', '2026-08-01', '2026-08-15'),
    janela('Turma 49', '2026-09-01', '2026-09-15'),
  ];

  it('resolve a janela que contém a data', () => {
    expect(turmaEfetiva(new Date('2026-09-05'), janelas)).toBe('Turma 49');
  });

  it('sem janela aplicável -> null', () => {
    expect(turmaEfetiva(new Date('2026-10-01'), janelas)).toBeNull();
  });

  it('duas janelas sobrepostas -> a de início mais recente vence', () => {
    const sobrepostas = [
      janela('Turma 50', '2026-10-01', '2026-10-20'),
      janela('Turma 51', '2026-10-10', '2026-10-25'),
    ];
    expect(turmaEfetiva(new Date('2026-10-15'), sobrepostas)).toBe('Turma 51');
  });

  it('lista vazia -> null', () => {
    expect(turmaEfetiva(new Date('2026-09-05'), [])).toBeNull();
  });
});
