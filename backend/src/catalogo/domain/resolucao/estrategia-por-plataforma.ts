import { PlataformaOrigem } from '../../../core/core.module';

/**
 * Estratégia de resolução de oferta por conta (spec 023, D-03) — dado, não `if`
 * espalhado. Mesmo espírito do `MAPAS_STATUS` do `financeiro` (018): uma tabela
 * testável por varredura de cobertura das 7 contas, nunca uma condição de
 * plataforma escondida no meio de outra função.
 *
 * `TAG`: decodifica/localiza a tag AEN (`decodificarTag`/`localizarTag`),
 * auto-cria produto/oferta na 1ª venda de uma tag nova (visão, Decisões em
 * aberto #2).
 *
 * `CATALOGO_HOTMART`: resolve **só** contra `oferta_origem_ref` importado do
 * catálogo Hotmart (`price.code` exato) — nunca auto-cria oferta, nunca cai
 * pra tag (visão, Decisões em aberto #3 — decisão de negócio já confirmada
 * com o dono do produto).
 */
export type EstrategiaResolucaoOferta = 'TAG' | 'CATALOGO_HOTMART';

export const ESTRATEGIA_RESOLUCAO_OFERTA: Readonly<
  Record<PlataformaOrigem, EstrategiaResolucaoOferta>
> = Object.freeze({
  [PlataformaOrigem.TMB]: 'TAG',
  [PlataformaOrigem.ASAAS_PRD]: 'TAG',
  [PlataformaOrigem.ASAAS_SVC]: 'TAG',
  [PlataformaOrigem.GURU_PRD]: 'TAG',
  [PlataformaOrigem.GURU_SVC]: 'TAG',
  [PlataformaOrigem.HOTMART_PRD]: 'CATALOGO_HOTMART',
  [PlataformaOrigem.HOTMART_SVC]: 'CATALOGO_HOTMART',
});

/**
 * `plataforma` chega como `string` solto (`EntradaEtapaExterna.plataformaOrigem`).
 * Valor fora do enum das 7 contas → `TAG` (permissivo; nunca deveria acontecer,
 * pois `EventoCanonico.plataformaOrigem` já é validado por `zod` na borda).
 */
export function estrategiaDe(plataforma: string): EstrategiaResolucaoOferta {
  return (
    (ESTRATEGIA_RESOLUCAO_OFERTA as Record<string, EstrategiaResolucaoOferta>)[plataforma] ??
    'TAG'
  );
}
