import { mapearStatusEntrega, mapearTipoConteudo } from './mapear-status-entrega';

describe('mapearStatusEntrega', () => {
  it.each([
    ['sent', 'ENVIADA'],
    ['delivered', 'ENTREGUE'],
    ['read', 'LIDA'],
    ['failed', 'FALHOU'],
  ])('%s → %s', (entrada, esperado) => {
    expect(mapearStatusEntrega(entrada)).toBe(esperado);
  });

  it('valor desconhecido não lança — devolve null', () => {
    expect(() => mapearStatusEntrega('algo_novo_da_meta')).not.toThrow();
    expect(mapearStatusEntrega('algo_novo_da_meta')).toBeNull();
  });
});

describe('mapearTipoConteudo', () => {
  it.each([
    ['text', 'TEXTO'],
    ['image', 'IMAGEM'],
    ['audio', 'AUDIO'],
    ['document', 'DOCUMENTO'],
    ['video', 'VIDEO'],
  ])('%s → %s', (entrada, esperado) => {
    expect(mapearTipoConteudo(entrada)).toBe(esperado);
  });

  it('valor desconhecido → OUTRO (nunca lança)', () => {
    expect(mapearTipoConteudo('sticker')).toBe('OUTRO');
  });
});
