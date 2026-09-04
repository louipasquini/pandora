import { calcularSlaAtendimento } from './sla';

const abertoEm = new Date('2026-09-04T10:00:00Z');

describe('calcularSlaAtendimento', () => {
  it('sem resposta e dentro do prazo: não estourado, minutosRestantes correto', () => {
    const agora = new Date('2026-09-04T10:10:00Z'); // 10 min depois
    const r = calcularSlaAtendimento(
      { status: 'AGUARDANDO', abertoEm, primeiraRespostaEm: null, slaMinutos: 15 },
      agora,
    );
    expect(r.estourado).toBe(false);
    expect(r.minutosDecorridos).toBe(10);
    expect(r.minutosRestantes).toBe(5);
  });

  it('sem resposta e prazo estourado: estourado, minutosRestantes null', () => {
    const agora = new Date('2026-09-04T10:20:00Z'); // 20 min depois
    const r = calcularSlaAtendimento(
      { status: 'EM_ATENDIMENTO', abertoEm, primeiraRespostaEm: null, slaMinutos: 15 },
      agora,
    );
    expect(r.estourado).toBe(true);
    expect(r.minutosDecorridos).toBe(20);
    expect(r.minutosRestantes).toBeNull();
  });

  it('exatamente no limite ainda não estourou (estritamente maior que o prazo)', () => {
    const agora = new Date('2026-09-04T10:15:00Z'); // exatamente 15 min
    const r = calcularSlaAtendimento(
      { status: 'AGUARDANDO', abertoEm, primeiraRespostaEm: null, slaMinutos: 15 },
      agora,
    );
    expect(r.estourado).toBe(false);
    expect(r.minutosRestantes).toBe(0);
  });

  it('já respondido nunca estoura, mesmo muito depois do prazo', () => {
    const agora = new Date('2026-09-05T10:00:00Z'); // 1 dia depois
    const r = calcularSlaAtendimento(
      {
        status: 'EM_ATENDIMENTO',
        abertoEm,
        primeiraRespostaEm: new Date('2026-09-04T10:05:00Z'),
        slaMinutos: 15,
      },
      agora,
    );
    expect(r.estourado).toBe(false);
    expect(r.minutosRestantes).toBeNull();
  });

  it('encerrado nunca estoura, mesmo sem resposta', () => {
    const agora = new Date('2026-09-05T10:00:00Z');
    const r = calcularSlaAtendimento(
      { status: 'ENCERRADO', abertoEm, primeiraRespostaEm: null, slaMinutos: 15 },
      agora,
    );
    expect(r.estourado).toBe(false);
    expect(r.minutosRestantes).toBeNull();
  });
});
