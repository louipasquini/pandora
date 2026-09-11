import { valorEfetivo } from './precedencia';
import type { TurmaTipo } from './tag/decodificar-tag';

/**
 * Projeção do **valor efetivo de leitura** de `produto`/`oferta` (Princípio V —
 * função pura, nunca coluna materializada). Curado vence quando presente,
 * senão derivado, senão `null` (D-07).
 */

export interface ProdutoLinha {
  id: string;
  codigo: string;
  nomeCurado: string | null;
  nomeDerivado: string | null;
  assinaturaCurada: boolean | null;
  assinaturaDerivada: boolean | null;
  camposEditados: string[];
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface ProdutoProjetado extends ProdutoLinha {
  nome: string | null;
  assinatura: boolean | null;
}

export function projetarProduto(p: ProdutoLinha): ProdutoProjetado {
  return {
    ...p,
    nome: valorEfetivo(p.nomeCurado, p.nomeDerivado),
    assinatura: valorEfetivo(p.assinaturaCurada, p.assinaturaDerivada),
  };
}

export interface TurmaEfetivaOferta {
  tipo: TurmaTipo | null;
  numero: number | null;
}

export interface OfertaLinha {
  id: string;
  produtoId: string;
  turmaTipoCurado: TurmaTipo | null;
  turmaNumeroCurado: number | null;
  turmaTipoDerivado: TurmaTipo | null;
  turmaNumeroDerivado: number | null;
  subprodutoCodigoCurado: string | null;
  subprodutoCodigoDerivado: string | null;
  modeloCobrancaCodigoCurado: string | null;
  modeloCobrancaCodigoDerivado: string | null;
  modeloTransacaoCodigoCurado: string | null;
  modeloTransacaoCodigoDerivado: string | null;
  camposEditados: string[];
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface OfertaProjetada extends OfertaLinha {
  turma: TurmaEfetivaOferta;
  subprodutoCodigo: string | null;
  modeloCobrancaCodigo: string | null;
  modeloTransacaoCodigo: string | null;
}

/** A turma efetiva nunca mistura tipo/número de fontes diferentes (spec 023, data-model.md). */
export function turmaEfetivaDeOferta(o: OfertaLinha): TurmaEfetivaOferta {
  if (o.turmaTipoCurado != null) {
    return { tipo: o.turmaTipoCurado, numero: o.turmaNumeroCurado ?? null };
  }
  if (o.turmaTipoDerivado != null) {
    return { tipo: o.turmaTipoDerivado, numero: o.turmaNumeroDerivado ?? null };
  }
  return { tipo: null, numero: null };
}

export function projetarOferta(o: OfertaLinha): OfertaProjetada {
  return {
    ...o,
    turma: turmaEfetivaDeOferta(o),
    subprodutoCodigo: valorEfetivo(o.subprodutoCodigoCurado, o.subprodutoCodigoDerivado),
    modeloCobrancaCodigo: valorEfetivo(
      o.modeloCobrancaCodigoCurado,
      o.modeloCobrancaCodigoDerivado,
    ),
    modeloTransacaoCodigo: valorEfetivo(
      o.modeloTransacaoCodigoCurado,
      o.modeloTransacaoCodigoDerivado,
    ),
  };
}
