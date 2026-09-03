import { montarRegistroAuditoria, OrigemMudanca } from './registro-auditoria';

const base = {
  autor: 'svc:painel',
  entidade: 'produto',
  entidadeId: '018f...-id',
  campo: 'nome',
  valorAnterior: 'X',
  valorNovo: 'Y',
  motivo: 'correção de digitação',
  origem: OrigemMudanca.CURADORIA,
};

describe('montarRegistroAuditoria', () => {
  afterEach(() => jest.useRealTimers());

  it('preenche quando com agoraUtc() se ausente', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-03T10:00:00.000Z'));

    const r = montarRegistroAuditoria(base);
    expect(r.quando.toISOString()).toBe('2026-09-03T10:00:00.000Z');
  });

  it('respeita quando explícito', () => {
    const quando = new Date('2020-01-01T00:00:00.000Z');
    expect(montarRegistroAuditoria({ ...base, quando }).quando).toBe(quando);
  });

  it('devolve todos os campos do contrato', () => {
    const r = montarRegistroAuditoria({ ...base, quando: new Date(0) });
    expect(r).toEqual({
      autor: 'svc:painel',
      quando: new Date(0),
      entidade: 'produto',
      entidadeId: '018f...-id',
      campo: 'nome',
      valorAnterior: 'X',
      valorNovo: 'Y',
      motivo: 'correção de digitação',
      origem: OrigemMudanca.CURADORIA,
    });
  });

  it('rejeita motivo vazio / só espaços', () => {
    expect(() => montarRegistroAuditoria({ ...base, motivo: '' })).toThrow(TypeError);
    expect(() => montarRegistroAuditoria({ ...base, motivo: '   ' })).toThrow(TypeError);
  });

  it('rejeita origem fora do enum', () => {
    expect(() =>
      montarRegistroAuditoria({ ...base, origem: 'OUTRA' as unknown as OrigemMudanca }),
    ).toThrow(TypeError);
  });
});
