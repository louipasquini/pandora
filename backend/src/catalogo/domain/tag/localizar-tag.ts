import { FORMATO_TAG } from './decodificar-tag';

/**
 * Os "2 localizadores" da tag AEN (spec 023, D-02) — estratégias **genéricas**,
 * platform-agnostic, aplicadas sobre os campos já extraídos pelos adapters
 * 019–022 (`EventoCanonico.oferta.codigoOrigem`/`nomeOrigem`). Não há um
 * localizador "por plataforma": a Guru grava a própria tag como
 * `product.offer.id` (cai na âncora), TMB/Asaas só têm texto livre.
 *
 * A Hotmart nunca passa por aqui — sua estratégia de resolução é só por
 * catálogo importado (`ESTRATEGIA_RESOLUCAO_OFERTA`), nunca por tag.
 */

/** Padrão de localização em texto livre: `#PCS48XAV` (visão, glossário). */
const PADRAO_TEXTO_LIVRE = /#([A-Z]{3}[A-Z0-9]{5})\b/;

export interface CamposOfertaOrigem {
  codigoOrigem?: string | null;
  nomeOrigem?: string | null;
}

/**
 * 1. **Ancorada**: `codigoOrigem` inteiro casa o formato exato da tag → usa
 *    direto, sem procurar.
 * 2. **Texto livre**: senão, procura `#<8 chars>` em `codigoOrigem` e depois em
 *    `nomeOrigem` — primeiro achado vence.
 * 3. Nada encontrado → `null`.
 */
export function localizarTag(campos: CamposOfertaOrigem): string | null {
  const codigoOrigem = campos.codigoOrigem?.trim().toUpperCase() ?? '';
  if (FORMATO_TAG.test(codigoOrigem)) return codigoOrigem;

  const doCodigo = PADRAO_TEXTO_LIVRE.exec((campos.codigoOrigem ?? '').toUpperCase());
  if (doCodigo) return doCodigo[1];

  const doNome = PADRAO_TEXTO_LIVRE.exec((campos.nomeOrigem ?? '').toUpperCase());
  if (doNome) return doNome[1];

  return null;
}
