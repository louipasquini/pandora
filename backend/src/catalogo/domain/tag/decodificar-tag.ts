/**
 * Decodificador da tag AEN de 8 caracteres (visão, glossário — `PCS48XAV`:
 * produto 3 + turma 2 + subproduto 1 + modelo de cobrança 1 + modelo de
 * transação 1). Função **pura**, sem efeitos colaterais, sem banco.
 *
 * O mapeamento caractere→significado de negócio de `subproduto`/
 * `modeloCobranca`/`modeloTransacao` não está documentado em lugar nenhum do
 * projeto (o `src/services/oferta_tag.py` da v1 não foi migrado — spec 023
 * §Assumptions/D-01). Por isso os 3 códigos de 1 caractere são devolvidos
 * **crus**, sem tradução — nunca um palpite (Regra Inviolável nº 15).
 *
 * O segmento de turma (2 chars) tem semântica conhecida pela análise da v1
 * (visão, seção 4.8): `"X0"` → evergreen, `"00"` → perpétuo, `\d{2}` → número
 * de turma; qualquer outro valor → `DESCONHECIDO` (cru preservado).
 */

/** Formato exato de uma tag AEN válida: 3 letras + 5 chars alfanuméricos maiúsculos. */
export const FORMATO_TAG = /^[A-Z]{3}[A-Z0-9]{5}$/;

export type TurmaTipo = 'NUMERO' | 'EVERGREEN' | 'PERPETUO' | 'DESCONHECIDO';

export interface TurmaDecodificada {
  tipo: TurmaTipo;
  numero: number | null;
  /** os 2 caracteres crus, preservados mesmo quando `tipo === 'DESCONHECIDO'`. */
  bruto: string;
}

export interface TagDecodificada {
  codigoProduto: string;
  turma: TurmaDecodificada;
  subprodutoCodigo: string;
  modeloCobrancaCodigo: string;
  modeloTransacaoCodigo: string;
}

function decodificarTurma(bruto: string): TurmaDecodificada {
  if (bruto === 'X0') return { tipo: 'EVERGREEN', numero: null, bruto };
  if (bruto === '00') return { tipo: 'PERPETUO', numero: null, bruto };
  if (/^\d{2}$/.test(bruto)) return { tipo: 'NUMERO', numero: Number(bruto), bruto };
  return { tipo: 'DESCONHECIDO', numero: null, bruto };
}

/** `null` quando `tag` não casa o formato exato de 8 caracteres. */
export function decodificarTag(tag: string): TagDecodificada | null {
  if (typeof tag !== 'string' || !FORMATO_TAG.test(tag)) return null;
  return {
    codigoProduto: tag.slice(0, 3),
    turma: decodificarTurma(tag.slice(3, 5)),
    subprodutoCodigo: tag[5],
    modeloCobrancaCodigo: tag[6],
    modeloTransacaoCodigo: tag[7],
  };
}
