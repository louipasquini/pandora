import { escolherAtendentePorCarga } from './roteamento';

describe('escolherAtendentePorCarga', () => {
  it('escolhe quem tem a menor carga atual', () => {
    const escolhido = escolherAtendentePorCarga([
      { usuarioId: 'a', cargaAtual: 2 },
      { usuarioId: 'b', cargaAtual: 0 },
      { usuarioId: 'c', cargaAtual: 1 },
    ]);
    expect(escolhido).toBe('b');
  });

  it('desempata pelo menor usuarioId, deterministicamente', () => {
    const candidatos = [
      { usuarioId: 'zzz', cargaAtual: 1 },
      { usuarioId: 'aaa', cargaAtual: 1 },
      { usuarioId: 'mmm', cargaAtual: 1 },
    ];
    expect(escolherAtendentePorCarga(candidatos)).toBe('aaa');
    // determinístico: chamar de novo com a mesma entrada (em outra ordem) dá o mesmo resultado
    expect(escolherAtendentePorCarga([...candidatos].reverse())).toBe('aaa');
  });

  it('lista vazia devolve null (fica em AGUARDANDO)', () => {
    expect(escolherAtendentePorCarga([])).toBeNull();
  });

  it('candidato único é sempre escolhido, mesmo com carga alta', () => {
    expect(escolherAtendentePorCarga([{ usuarioId: 'a', cargaAtual: 9 }])).toBe('a');
  });

  it('não muta o array de entrada', () => {
    const candidatos = [
      { usuarioId: 'b', cargaAtual: 1 },
      { usuarioId: 'a', cargaAtual: 1 },
    ];
    const copia = [...candidatos];
    escolherAtendentePorCarga(candidatos);
    expect(candidatos).toEqual(copia);
  });
});
