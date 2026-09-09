import { interpretarRespostaIa } from './parse-resposta';

describe('interpretarRespostaIa', () => {
  const FAQ_ID_1 = '11111111-1111-4111-8111-111111111111';
  const FAQ_ID_2 = '22222222-2222-4222-8222-222222222222';

  it('JSON válido com 1 sugestão de resposta', () => {
    const bruto = JSON.stringify([
      { tipo: 'RESPOSTA', perguntaDetectada: 'Posso parcelar?', conteudoSugerido: 'Em até 12x.', faqItemId: FAQ_ID_1 },
    ]);

    const { sugestoes, problema } = interpretarRespostaIa(bruto);

    expect(problema).toBeNull();
    expect(sugestoes).toEqual([
      { tipo: 'RESPOSTA', perguntaDetectada: 'Posso parcelar?', conteudoSugerido: 'Em até 12x.', faqItemId: FAQ_ID_1 },
    ]);
  });

  it('JSON válido com sugestão de campo personalizado', () => {
    const bruto = JSON.stringify([
      { tipo: 'CAMPO_PERSONALIZADO', conteudoSugerido: '5', campoPersonalizadoChave: 'anos_experiencia' },
    ]);

    const { sugestoes, problema } = interpretarRespostaIa(bruto);

    expect(problema).toBeNull();
    expect(sugestoes).toEqual([
      {
        tipo: 'CAMPO_PERSONALIZADO',
        perguntaDetectada: null,
        conteudoSugerido: '5',
        campoPersonalizadoChave: 'anos_experiencia',
      },
    ]);
  });

  it('múltiplas perguntas na mesma mensagem geram múltiplas sugestões distintas', () => {
    const bruto = JSON.stringify([
      { tipo: 'RESPOSTA', perguntaDetectada: 'Qual o prazo?', conteudoSugerido: '12 meses.', faqItemId: FAQ_ID_1 },
      { tipo: 'RESPOSTA', perguntaDetectada: 'Tem parcelamento?', conteudoSugerido: 'Em até 12x.', faqItemId: FAQ_ID_2 },
    ]);

    const { sugestoes } = interpretarRespostaIa(bruto);

    expect(sugestoes).toHaveLength(2);
    expect(sugestoes.map((s) => s.perguntaDetectada)).toEqual(['Qual o prazo?', 'Tem parcelamento?']);
  });

  it('JSON malformado nunca lança — devolve lista vazia + problema', () => {
    expect(interpretarRespostaIa('{ isso não é json')).toEqual({
      sugestoes: [],
      problema: 'resposta_nao_e_json',
    });
  });

  it('resposta que não é uma lista devolve lista vazia + problema', () => {
    expect(interpretarRespostaIa(JSON.stringify({ tipo: 'RESPOSTA' }))).toEqual({
      sugestoes: [],
      problema: 'resposta_nao_e_lista',
    });
  });

  it('lista vazia é um resultado válido (sem correspondência) — sem problema', () => {
    expect(interpretarRespostaIa('[]')).toEqual({ sugestoes: [], problema: null });
  });

  it('item com campo obrigatório faltando é descartado, sem derrubar os demais', () => {
    const bruto = JSON.stringify([
      { tipo: 'RESPOSTA', conteudoSugerido: 'sem pergunta detectada' },
      { tipo: 'RESPOSTA', perguntaDetectada: 'Qual o prazo?', conteudoSugerido: '12 meses.' },
    ]);

    const { sugestoes, problema } = interpretarRespostaIa(bruto);

    expect(problema).toBeNull();
    expect(sugestoes).toHaveLength(1);
    expect(sugestoes[0]).toMatchObject({ perguntaDetectada: 'Qual o prazo?' });
  });

  it('tipo desconhecido é descartado', () => {
    const bruto = JSON.stringify([{ tipo: 'DESCONHECIDO', conteudoSugerido: 'x' }]);

    expect(interpretarRespostaIa(bruto)).toEqual({ sugestoes: [], problema: 'nenhum_item_valido' });
  });

  it('todos os itens inválidos → lista vazia + problema', () => {
    const bruto = JSON.stringify([{ tipo: 'RESPOSTA' }, { foo: 'bar' }]);

    expect(interpretarRespostaIa(bruto)).toEqual({ sugestoes: [], problema: 'nenhum_item_valido' });
  });
});
