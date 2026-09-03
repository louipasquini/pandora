import { estaEmExpediente } from './expediente';
import type { FeriadoAplic, JanelaAplic, OpcoesExpediente } from './tipos';

/** Janela global Mon–Fri 09:00–18:00 (America/Sao_Paulo). */
const semanaComercial: JanelaAplic[] = [1, 2, 3, 4, 5].map((d) => ({
  equipeId: null,
  diaSemana: d,
  inicioMin: 9 * 60,
  fimMin: 18 * 60,
  ativo: true,
}));

const opcoes = (o: Partial<OpcoesExpediente> = {}): OpcoesExpediente => ({
  janelas: o.janelas ?? semanaComercial,
  feriados: o.feriados ?? [],
  equipe: o.equipe ?? null,
});

// Sao Paulo = UTC-3 o ano todo (sem horário de verão desde 2019).
const D = (isoUtc: string) => new Date(isoUtc);

describe('estaEmExpediente', () => {
  it('quarta 14:00 dentro da janela → true', () => {
    expect(estaEmExpediente(D('2026-09-09T17:00:00Z'), opcoes())).toBe(true);
  });

  it('borda: 09:00 inclusivo (true), 18:00 exclusivo (false)', () => {
    expect(estaEmExpediente(D('2026-09-09T12:00:00Z'), opcoes())).toBe(true);
    expect(estaEmExpediente(D('2026-09-09T21:00:00Z'), opcoes())).toBe(false);
  });

  it('domingo sem janela → false', () => {
    expect(estaEmExpediente(D('2026-09-13T17:00:00Z'), opcoes())).toBe(false);
  });

  it('feriado não-recorrente na data → false, mesmo dentro da janela', () => {
    const feriados: FeriadoAplic[] = [
      { equipeId: null, mes: 10, dia: 14, ano: 2026, recorrenteAnual: false },
    ];
    expect(estaEmExpediente(D('2026-10-14T17:00:00Z'), opcoes({ feriados }))).toBe(
      false,
    );
    // mesma (mês,dia) em outro ano — não casa (não é recorrente)
    expect(estaEmExpediente(D('2027-10-14T17:00:00Z'), opcoes({ feriados }))).toBe(
      true,
    );
  });

  it('feriado recorrente casa todo ano por (mês,dia)', () => {
    const feriados: FeriadoAplic[] = [
      { equipeId: null, mes: 12, dia: 25, ano: 2026, recorrenteAnual: true },
    ];
    expect(estaEmExpediente(D('2030-12-25T17:00:00Z'), opcoes({ feriados }))).toBe(
      false,
    );
    expect(estaEmExpediente(D('2029-12-25T17:00:00Z'), opcoes({ feriados }))).toBe(
      false,
    );
  });

  it('feriado recorrente 29/02 → false em ano bissexto, sem deslocar em ano não bissexto', () => {
    const feriados: FeriadoAplic[] = [
      { equipeId: null, mes: 2, dia: 29, ano: 2028, recorrenteAnual: true },
    ];
    // 2028 é bissexto → 29/02 existe e cai numa terça com janela
    expect(estaEmExpediente(D('2028-02-29T17:00:00Z'), opcoes({ feriados }))).toBe(
      false,
    );
    // 2025 não é bissexto → 28/02 (sexta) NÃO vira feriado
    expect(estaEmExpediente(D('2025-02-28T17:00:00Z'), opcoes({ feriados }))).toBe(
      true,
    );
  });

  it('união global + equipe: sábado da equipe abre só quando se consulta com a equipe ativa', () => {
    const janelaSabadoEquipe: JanelaAplic = {
      equipeId: 'e1',
      diaSemana: 6,
      inicioMin: 8 * 60,
      fimMin: 12 * 60,
      ativo: true,
    };
    const janelas = [...semanaComercial, janelaSabadoEquipe];
    const sabado10h = D('2026-09-12T13:00:00Z');

    expect(
      estaEmExpediente(sabado10h, opcoes({ janelas, equipe: { id: 'e1', ativo: true } })),
    ).toBe(true);
    expect(estaEmExpediente(sabado10h, opcoes({ janelas, equipe: null }))).toBe(false);
    expect(
      estaEmExpediente(sabado10h, opcoes({ janelas, equipe: { id: 'e1', ativo: false } })),
    ).toBe(false);
    expect(
      estaEmExpediente(sabado10h, opcoes({ janelas, equipe: { id: 'e2', ativo: true } })),
    ).toBe(false);
  });

  it('feriado da equipe subtrai só quando se consulta com a equipe', () => {
    const feriados: FeriadoAplic[] = [
      { equipeId: 'e1', mes: 9, dia: 9, ano: 2026, recorrenteAnual: false },
    ];
    const quarta14 = D('2026-09-09T17:00:00Z');
    expect(
      estaEmExpediente(quarta14, opcoes({ feriados, equipe: { id: 'e1', ativo: true } })),
    ).toBe(false);
    expect(estaEmExpediente(quarta14, opcoes({ feriados, equipe: null }))).toBe(true);
  });

  it('janela inativa não conta', () => {
    const janelas = semanaComercial.map((j) => ({ ...j, ativo: false }));
    expect(estaEmExpediente(D('2026-09-09T17:00:00Z'), opcoes({ janelas }))).toBe(false);
  });

  it('nenhuma janela cadastrada → false', () => {
    expect(estaEmExpediente(D('2026-09-09T17:00:00Z'), opcoes({ janelas: [] }))).toBe(
      false,
    );
  });

  it('determinística — 500× a mesma entrada dá o mesmo resultado', () => {
    const inst = D('2026-09-09T17:00:00Z');
    const o = opcoes();
    const primeiro = estaEmExpediente(inst, o);
    for (let i = 0; i < 500; i += 1) {
      expect(estaEmExpediente(inst, o)).toBe(primeiro);
    }
  });

  it('independe do process.env.TZ (timeZone é explícito no Intl)', () => {
    const inst = D('2026-09-09T17:00:00Z');
    const o = opcoes();
    const tzOriginal = process.env.TZ;
    try {
      process.env.TZ = 'UTC';
      const a = estaEmExpediente(inst, o);
      process.env.TZ = 'Asia/Tokyo';
      const b = estaEmExpediente(inst, o);
      expect(a).toBe(true);
      expect(b).toBe(a);
    } finally {
      process.env.TZ = tzOriginal;
    }
  });
});
