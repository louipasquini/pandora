import { canonicalizar, hashEvento } from './hash-evento';

describe('hashEvento (spec 006)', () => {
  it('mesma entrada → mesmo hash', () => {
    const p = { id: 'x', valor: 100, nested: { a: 1, b: [1, 2, 3] } };
    expect(hashEvento(p)).toBe(hashEvento({ ...p }));
  });

  it('ordem das chaves é irrelevante', () => {
    expect(hashEvento({ a: 1, b: 2, c: { d: 3, e: 4 } })).toBe(
      hashEvento({ c: { e: 4, d: 3 }, b: 2, a: 1 }),
    );
  });

  it('payload materialmente diferente → hash diferente', () => {
    expect(hashEvento({ status: 'approved' })).not.toBe(
      hashEvento({ status: 'refunded' }),
    );
  });

  it('é hex de 64 chars (SHA-256)', () => {
    expect(hashEvento({ x: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('canonicaliza arrays preservando ordem e objetos ordenando chaves', () => {
    expect(canonicalizar({ b: 1, a: [{ y: 2, x: 1 }] })).toBe('{"a":[{"x":1,"y":2}],"b":1}');
  });

  it('lança em valor não JSON-serializável', () => {
    expect(() => hashEvento({ f: () => 1 })).toThrow(/serializ/i);
    expect(() => hashEvento({ n: 1n })).toThrow(/serializ/i);
    const ciclo: Record<string, unknown> = {};
    ciclo.self = ciclo;
    expect(() => hashEvento(ciclo)).toThrow(/circular/i);
  });

  it('livre de locale/TZ — independe de process.env.TZ', () => {
    const p = { data: '2026-09-03T12:00:00Z', v: 1234 };
    const antes = process.env.TZ;
    process.env.TZ = 'Asia/Tokyo';
    const h1 = hashEvento(p);
    process.env.TZ = 'America/Sao_Paulo';
    const h2 = hashEvento(p);
    process.env.TZ = antes;
    expect(h1).toBe(h2);
  });
});
