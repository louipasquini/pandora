/**
 * Montagem do prompt de sugestão de IA (spec 013, FR-003/FR-004/FR-007) —
 * puro, determinístico (mesma entrada → mesmo prompt, sem timestamp/
 * aleatoriedade embutidos). Instrui o modelo a devolver uma lista JSON de
 * sugestões — nunca texto livre — que `interpretarRespostaIa` (parse-resposta.ts)
 * valida na borda.
 */

export interface FaqItemAtivo {
  id: string;
  pergunta: string;
  resposta: string;
}

export interface DefinicaoCampoPersonalizadoPrompt {
  chave: string;
  rotulo: string;
  tipo: 'TEXTO' | 'NUMERO' | 'BOOLEANO' | 'DATA' | 'SELECAO';
}

export interface MensagemOrigemPrompt {
  texto: string;
}

export interface PromptSugestaoIa {
  sistema: string;
  usuario: string;
}

const INSTRUCAO_SISTEMA = `Você ajuda uma equipe de atendimento a responder alunas de um curso.
A partir da mensagem da aluna, da base de FAQ ativa e dos campos personalizados disponíveis,
proponha sugestões — NUNCA envie nada, apenas proponha.

Responda SOMENTE com uma lista JSON (sem texto fora do JSON), cada item em um dos formatos:

{"tipo":"RESPOSTA","perguntaDetectada":"...","conteudoSugerido":"...","faqItemId":"<id ou null>"}
{"tipo":"CAMPO_PERSONALIZADO","perguntaDetectada":"...","conteudoSugerido":"<valor>","campoPersonalizadoChave":"..."}

Regras:
- Se a mensagem tiver mais de uma pergunta, proponha um item RESPOSTA por pergunta.
- Só proponha RESPOSTA baseada em um item de FAQ da lista abaixo; sem correspondência
  razoável, NÃO proponha nada para aquela pergunta (não invente resposta de baixa confiança).
- Só proponha CAMPO_PERSONALIZADO quando a mensagem mencionar claramente um valor para uma
  das chaves disponíveis.
- Sem nenhuma sugestão aplicável, responda com a lista vazia: []`;

function formatarFaq(faqAtiva: readonly FaqItemAtivo[]): string {
  if (faqAtiva.length === 0) return '(nenhum item de FAQ ativo)';
  return faqAtiva.map((f) => `- [${f.id}] P: ${f.pergunta} | R: ${f.resposta}`).join('\n');
}

function formatarCampos(definicoes: readonly DefinicaoCampoPersonalizadoPrompt[]): string {
  if (definicoes.length === 0) return '(nenhum campo personalizado disponível)';
  return definicoes.map((d) => `- ${d.chave} (${d.rotulo}, tipo ${d.tipo})`).join('\n');
}

export function montarPrompt(
  mensagem: MensagemOrigemPrompt,
  faqAtiva: readonly FaqItemAtivo[],
  definicoesCampo: readonly DefinicaoCampoPersonalizadoPrompt[],
): PromptSugestaoIa {
  const usuario = [
    'Mensagem da aluna:',
    mensagem.texto,
    '',
    'FAQ ativa:',
    formatarFaq(faqAtiva),
    '',
    'Campos personalizados disponíveis:',
    formatarCampos(definicoesCampo),
  ].join('\n');

  return { sistema: INSTRUCAO_SISTEMA, usuario };
}
