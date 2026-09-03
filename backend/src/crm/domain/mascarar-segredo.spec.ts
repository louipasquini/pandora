import { mascararSegredo, ultimos4De } from './mascarar-segredo';

describe('mascarar-segredo', () => {
  it('ultimos4De pega os 4 últimos chars', () => {
    expect(ultimos4De('s3cr3t-1a2b')).toBe('1a2b');
    expect(ultimos4De('ab')).toBe('ab');
  });

  it('mascararSegredo prefixa com bullets', () => {
    expect(mascararSegredo('1a2b')).toBe('••••••1a2b');
  });

  it('sem segredo → null', () => {
    expect(mascararSegredo(null)).toBeNull();
    expect(mascararSegredo(undefined)).toBeNull();
    expect(mascararSegredo('')).toBeNull();
  });
});
