import { podeEditar } from './mutabilidade';

const nota = (over: Partial<Parameters<typeof podeEditar>[0]> = {}) => ({
  tipo: 'NOTA' as const,
  autorId: 'u1',
  removidoEm: null,
  ...over,
});

describe('podeEditar', () => {
  it('NOTA própria com interacao:registrar (autor) → ok', () => {
    expect(podeEditar(nota(), { id: 'u1', temInteracaoGerir: false })).toEqual({ ok: true });
  });

  it('NOTA de outro autor sem interacao:gerir → sem_permissao', () => {
    expect(podeEditar(nota(), { id: 'u2', temInteracaoGerir: false })).toEqual({
      ok: false,
      erro: 'sem_permissao',
    });
  });

  it('NOTA de outro autor com interacao:gerir → ok', () => {
    expect(podeEditar(nota(), { id: 'u2', temInteracaoGerir: true })).toEqual({ ok: true });
  });

  it('NOTA já removida → ja_removida, mesmo para o autor ou com gerir', () => {
    const removida = nota({ removidoEm: new Date().toISOString() });
    expect(podeEditar(removida, { id: 'u1', temInteracaoGerir: false })).toEqual({
      ok: false,
      erro: 'ja_removida',
    });
    expect(podeEditar(removida, { id: 'u9', temInteracaoGerir: true })).toEqual({
      ok: false,
      erro: 'ja_removida',
    });
  });

  it.each(['WHATSAPP', 'EMAIL', 'LIGACAO', 'TICKET', 'NPS'] as const)(
    '%s nunca é editável, mesmo com interacao:gerir',
    (tipo) => {
      const canal = { tipo, autorId: 'u1', removidoEm: null };
      expect(podeEditar(canal, { id: 'u1', temInteracaoGerir: true })).toEqual({
        ok: false,
        erro: 'tipo_nao_editavel',
      });
    },
  );

  it('sujeito sem id (ex.: credencial sem usuario) só passa com interacao:gerir', () => {
    expect(podeEditar(nota(), { id: undefined, temInteracaoGerir: false })).toEqual({
      ok: false,
      erro: 'sem_permissao',
    });
    expect(podeEditar(nota(), { id: undefined, temInteracaoGerir: true })).toEqual({ ok: true });
  });
});
