import { montarPrompt } from './prompt';

describe('montarPrompt', () => {
  it('é determinístico — mesma entrada produz o mesmo prompt', () => {
    const mensagem = { texto: 'Posso parcelar?' };
    const faq = [{ id: 'faq-1', pergunta: 'Posso parcelar?', resposta: 'Em até 12x.' }];
    const campos = [{ chave: 'anos_experiencia', rotulo: 'Anos de experiência', tipo: 'NUMERO' as const }];

    const a = montarPrompt(mensagem, faq, campos);
    const b = montarPrompt(mensagem, faq, campos);

    expect(a).toEqual(b);
  });

  it('inclui a mensagem, a FAQ e os campos personalizados no prompt do usuário', () => {
    const { usuario } = montarPrompt(
      { texto: 'Quero saber o prazo' },
      [{ id: 'faq-1', pergunta: 'Qual o prazo?', resposta: '12 meses.' }],
      [{ chave: 'anos_experiencia', rotulo: 'Anos de experiência', tipo: 'NUMERO' }],
    );

    expect(usuario).toContain('Quero saber o prazo');
    expect(usuario).toContain('Qual o prazo?');
    expect(usuario).toContain('anos_experiencia');
  });

  it('mensagem vazia e listas vazias não quebram a montagem', () => {
    const prompt = montarPrompt({ texto: '' }, [], []);

    expect(prompt.usuario).toContain('(nenhum item de FAQ ativo)');
    expect(prompt.usuario).toContain('(nenhum campo personalizado disponível)');
  });

  it('instrui o modelo a responder só em JSON, nunca aplicar nada sozinho', () => {
    const { sistema } = montarPrompt({ texto: 'oi' }, [], []);

    expect(sistema).toContain('JSON');
    expect(sistema.toLowerCase()).toContain('nunca envie');
  });
});
