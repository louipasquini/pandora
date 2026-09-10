import { Classificacao } from '@prisma/client';

/**
 * A etapa `RESOLVER_PESSOA` deve **criar** uma `pessoa` se o comprador não casar?
 *
 * `false` **só** para `VENDA_AFILIADA` (Regra Inviolável nº 8: venda como afiliada
 * nunca gera cliente novo — vincula só se já existe). Qualquer outra classificação
 * (incl. `DESCONHECIDO`) → `true`: a afiliada é o único caso proibido; um evento
 * ambíguo que na verdade é venda própria não pode ficar sem cliente por causa de
 * uma classificação conservadora — a revisão trata o resto.
 */
export function deveCriarPessoa(classificacao: string): boolean {
  return classificacao !== Classificacao.VENDA_AFILIADA;
}
