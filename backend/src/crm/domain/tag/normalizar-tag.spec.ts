import { normalizarTag, normalizarTags } from './normalizar-tag';

describe('normalizarTag', () => {
  it('faz trim + lowercase + espaço interno vira hífen', () => {
    expect(normalizarTag('  Webinar Out  ')).toEqual({ valor: 'webinar-out' });
    expect(normalizarTag('webinar out')).toEqual({ valor: 'webinar-out' });
    expect(normalizarTag('WEBINAR-OUT')).toEqual({ valor: 'webinar-out' });
  });

  it('variações de caixa/espaço convergem para o mesmo slug', () => {
    const a = normalizarTag('Cliente VIP');
    const b = normalizarTag('cliente   vip');
    const c = normalizarTag(' CLIENTE-VIP ');
    expect(a.valor).toBe(b.valor);
    expect(b.valor).toBe(c.valor);
  });

  it('remove caracteres fora de [a-z0-9_-]', () => {
    expect(normalizarTag('Bug #123!!')).toEqual({ valor: 'bug-123' });
  });

  it('vazia após normalizar → erro', () => {
    expect(normalizarTag('   ')).toEqual({ erro: 'tag vazia após normalizar' });
    expect(normalizarTag('###')).toEqual({ erro: 'tag vazia após normalizar' });
    expect(normalizarTag(null)).toEqual({ erro: 'tag vazia após normalizar' });
    expect(normalizarTag(undefined)).toEqual({ erro: 'tag vazia após normalizar' });
  });

  it('acima de 60 caracteres → erro', () => {
    expect(normalizarTag('a'.repeat(61))).toEqual({ erro: 'tag acima de 60 caracteres' });
  });
});

describe('normalizarTags', () => {
  it('normaliza e deduplica', () => {
    expect(normalizarTags(['Webinar Out', 'webinar-out', 'Outro'])).toEqual({
      valor: ['webinar-out', 'outro'],
    });
  });

  it('lista vazia/ausente → []', () => {
    expect(normalizarTags(undefined)).toEqual({ valor: [] });
    expect(normalizarTags([])).toEqual({ valor: [] });
  });

  it('propaga o 1º erro', () => {
    expect(normalizarTags(['ok', '   '])).toEqual({ erro: 'tag vazia após normalizar' });
  });
});
