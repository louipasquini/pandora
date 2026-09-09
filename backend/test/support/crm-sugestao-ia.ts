import type { PromptSugestaoIa } from '../../src/crm/domain/sugestao-ia';
import type { ResultadoChamadaIa, SugestaoIaClient } from '../../src/crm/application/sugestao-ia';

/** Dublê controlável de `SugestaoIaClient` — 0 chamada de rede real nos testes. */
export interface SugestaoIaDublê extends SugestaoIaClient {
  /** JSON bruto a devolver na próxima chamada (default: `[]`). */
  proximoTextoBruto: string;
  /** Quando definido, a próxima chamada devolve `{ ok: false, motivo }`. */
  falharProxima: string | null;
  prompts: PromptSugestaoIa[];
}

export function criarSugestaoIaDublê(): SugestaoIaDublê {
  const dublê: SugestaoIaDublê = {
    proximoTextoBruto: '[]',
    falharProxima: null,
    prompts: [],
    async gerarSugestoes(prompt: PromptSugestaoIa): Promise<ResultadoChamadaIa> {
      dublê.prompts.push(prompt);
      if (dublê.falharProxima) {
        const motivo = dublê.falharProxima;
        dublê.falharProxima = null;
        return { ok: false, motivo };
      }
      return { ok: true, textoBruto: dublê.proximoTextoBruto };
    },
  };
  return dublê;
}
