import { parseInstante } from './parse-instante';

/**
 * Este arquivo é executado também sob `TZ` diferentes no CI (UTC /
 * America/Sao_Paulo / Asia/Tokyo). Todos os asserts abaixo têm de dar o mesmo
 * resultado em qualquer fuso da máquina.
 */
describe('parseInstante', () => {
  const iso = (d: Date | null) => (d ? d.toISOString() : null);

  describe('ISO 8601', () => {
    it('com Z e com offset resultam no mesmo instante', () => {
      const a = parseInstante('2026-03-01T12:00:00Z');
      const b = parseInstante('2026-03-01T09:00:00-03:00');
      expect(a.motivo).toBeUndefined();
      expect(iso(a.valor)).toBe('2026-03-01T12:00:00.000Z');
      expect(iso(b.valor)).toBe(iso(a.valor));
    });

    it('sem fuso é assumida UTC, com motivo', () => {
      const r = parseInstante('2026-03-01T12:00:00');
      expect(iso(r.valor)).toBe('2026-03-01T12:00:00.000Z');
      expect(r.motivo).toMatch(/assumido UTC/);
    });

    it('só data (sem hora) → meia-noite UTC, com motivo', () => {
      const r = parseInstante('2026-03-01');
      expect(iso(r.valor)).toBe('2026-03-01T00:00:00.000Z');
      expect(r.motivo).toMatch(/assumido UTC/);
    });

    it('data e hora separadas por espaço (sem fuso) → UTC', () => {
      const r = parseInstante('2026-03-01 12:00:00');
      expect(iso(r.valor)).toBe('2026-03-01T12:00:00.000Z');
      expect(r.motivo).toMatch(/assumido UTC/);
    });

    it('Z minúsculo é tolerado', () => {
      expect(iso(parseInstante('2026-03-01T12:00:00z').valor)).toBe(
        '2026-03-01T12:00:00.000Z',
      );
    });
  });

  describe('epoch', () => {
    it('segundos e milissegundos resultam no mesmo instante', () => {
      const s = parseInstante(1_772_539_200);
      const ms = parseInstante(1_772_539_200_000);
      expect(iso(s.valor)).toBe(iso(ms.valor));
      expect(s.valor).not.toBeNull();
    });

    it('aceita string numérica', () => {
      expect(iso(parseInstante('1772539200000').valor)).toBe(
        iso(parseInstante(1_772_539_200_000).valor),
      );
    });

    it('epoch 0 e negativo são instantes válidos', () => {
      expect(iso(parseInstante(0).valor)).toBe('1970-01-01T00:00:00.000Z');
      expect(parseInstante(-1_000_000_000).valor).not.toBeNull();
    });

    it('NaN / Infinity → null + motivo', () => {
      expect(parseInstante(Number.NaN).valor).toBeNull();
      expect(parseInstante(Number.POSITIVE_INFINITY)).toEqual({
        valor: null,
        motivo: expect.stringMatching(/não finito/),
      });
    });
  });

  describe('Date de entrada', () => {
    it('válido → cópia do mesmo instante', () => {
      const d = new Date('2026-03-01T12:00:00Z');
      const r = parseInstante(d);
      expect(iso(r.valor)).toBe(iso(d));
      expect(r.valor).not.toBe(d);
    });

    it('inválido → null + motivo', () => {
      expect(parseInstante(new Date('nope')).valor).toBeNull();
    });
  });

  describe('lixo → null + motivo não vazio (nunca lança)', () => {
    it.each([
      ['string vazia', ''],
      ['espaços', '   '],
      ['n/a', 'n/a'],
      ['zero-date', '0000-00-00'],
      ['dd/mm/aaaa', '01/03/2026'],
      ['dd/mm/aaaa hh:mm', '01/03/2026 09:30'],
      ['texto', 'ontem'],
      ['null', null],
      ['undefined', undefined],
      ['boolean', true],
      ['objeto', {}],
    ])('%s', (_nome, entrada) => {
      const r = parseInstante(entrada as unknown);
      expect(r.valor).toBeNull();
      expect(r.motivo && r.motivo.length).toBeGreaterThan(0);
    });
  });

  describe('independência de fuso da máquina', () => {
    it('não usa o TZ do processo para interpretar ISO sem fuso', () => {
      // Se o parser usasse hora local, sob TZ=America/Sao_Paulo isto viraria 15:00Z.
      const r = parseInstante('2026-03-01T12:00:00');
      expect(iso(r.valor)).toBe('2026-03-01T12:00:00.000Z');
    });
  });
});
