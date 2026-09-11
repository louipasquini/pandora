import { detectarSeparador, dividirLinha, lerCsv } from './parse-csv';

describe('detectarSeparador', () => {
  it('vírgula quando predomina', () => {
    expect(detectarSeparador('a,b,c')).toBe(',');
  });
  it('ponto e vírgula quando predomina', () => {
    expect(detectarSeparador('a;b;c,d')).toBe(';');
  });
  it('empate -> vírgula', () => {
    expect(detectarSeparador('a,b;c')).toBe(',');
  });
});

describe('dividirLinha', () => {
  it('separa campos simples', () => {
    expect(dividirLinha('a,b,c', ',')).toEqual(['a', 'b', 'c']);
  });
  it('respeita aspas com o separador dentro', () => {
    expect(dividirLinha('"a,b",c', ',')).toEqual(['a,b', 'c']);
  });
  it('aspa dupla escapada vira aspa literal', () => {
    expect(dividirLinha('"a""b",c', ',')).toEqual(['a"b', 'c']);
  });
});

describe('lerCsv', () => {
  it('separa cabeçalho (minúsculo) e linhas', () => {
    const r = lerCsv('Codigo,Nome\nPCS,Programa\nNMX,Nutrição Max\n');
    expect(r?.cabecalho).toEqual(['codigo', 'nome']);
    expect(r?.linhas).toEqual([
      ['PCS', 'Programa'],
      ['NMX', 'Nutrição Max'],
    ]);
  });

  it('remove BOM', () => {
    const r = lerCsv('﻿codigo,nome\nPCS,Programa\n');
    expect(r?.cabecalho).toEqual(['codigo', 'nome']);
  });

  it('só cabeçalho (0 linha de dado) -> null', () => {
    expect(lerCsv('codigo,nome\n')).toBeNull();
  });

  it('vazio -> null', () => {
    expect(lerCsv('')).toBeNull();
  });

  it('ignora linhas em branco', () => {
    const r = lerCsv('codigo,nome\nPCS,Programa\n\n\nNMX,Nutrição\n');
    expect(r?.linhas).toHaveLength(2);
  });
});
