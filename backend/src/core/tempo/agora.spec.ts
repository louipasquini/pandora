import { agoraUtc } from './agora';

describe('agoraUtc', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('retorna o instante atual como Date', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    expect(agoraUtc()).toBeInstanceOf(Date);
    expect(agoraUtc().toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('acompanha o avanço do relógio', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-15T12:30:00.000Z'));
    const t1 = agoraUtc();

    jest.advanceTimersByTime(5_000);
    const t2 = agoraUtc();

    expect(t2.getTime() - t1.getTime()).toBe(5_000);
  });

  it('produz instâncias distintas a cada chamada (não faz cache)', () => {
    const a = agoraUtc();
    const b = agoraUtc();
    expect(a).not.toBe(b);
  });
});
