import type { PromptSugestaoIa } from '../../domain/sugestao-ia';

/** Token de injeção (spec 013) — implementação padrão: `AnthropicSugestaoIaClient`. */
export const SUGESTAO_IA_CLIENT = 'SUGESTAO_IA_CLIENT';

/** Convenção de nome da `integracao` (spec 007) que guarda a credencial da IA. */
export const NOME_INTEGRACAO_SUGESTAO_IA = 'sugestao-ia-anthropic';

export type ResultadoChamadaIa =
  | { ok: true; textoBruto: string }
  | { ok: false; motivo: string };

/**
 * Porta para o provedor de IA (spec 013) — injetada por DI para permitir um
 * dublê nos testes (0 chamada de rede real, mesmo padrão de `GraphApiClient`,
 * 011). **Nunca lança** — falha do provedor (credencial ausente, rede,
 * timeout, resposta inesperada) devolve `{ ok: false, motivo }`; quem chama
 * (GerarSugestaoService) nunca deixa isso travar o atendimento (FR-014).
 */
export interface SugestaoIaClient {
  gerarSugestoes(prompt: PromptSugestaoIa): Promise<ResultadoChamadaIa>;
}
