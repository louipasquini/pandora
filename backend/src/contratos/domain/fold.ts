import { AditivoRotulo, Classificacao, StatusTransacaoCanonico } from '@prisma/client';
import {
  Dinheiro,
  contaComoReceita,
  liberaAcesso,
  type StatusTransacaoCanonico as StatusTransacaoCanonicoCore,
} from '../../core/core.module';

/** 1 transação já qualificada (CL-02 do spec) — insumo puro do fold, sem banco. */
export interface TransacaoParaFold {
  transacaoId: string;
  classificacao: Classificacao;
  statusCanonico: StatusTransacaoCanonico;
  /** `null` → data não parseável (etapa 3 já marcou revisão na própria transação). */
  ocorridoEm: Date | null;
  valorBruto: Dinheiro | null;
  valorLiquido: Dinheiro | null;
  /** `oferta_catalogo.tempoAcessoDias` (spec 023) — `null` = ainda não curado. */
  tempoAcessoDias: number | null;
}

export interface AditivoFold {
  transacaoId: string;
  rotulo: AditivoRotulo;
  /** `Contrato.fimAcesso` depois de aplicar este aditivo, na ordem do fold. */
  fimAcessoResultante: Date | null;
  precisaRevisao: boolean;
  motivoRevisao: string | null;
}

export interface ResultadoFold {
  fimAcesso: Date | null;
  /** Por moeda — nunca soma moedas diferentes (Regra Inviolável nº 6). */
  ticketTotal: Record<string, bigint>;
  valorRecebido: Record<string, bigint>;
  aditivos: readonly AditivoFold[];
}

function somarNoDict(dict: Record<string, bigint>, valor: Dinheiro): void {
  dict[valor.moeda] = (dict[valor.moeda] ?? 0n) + valor.valorInt;
}

function somarDias(base: Date, dias: number): Date {
  const resultado = new Date(base.getTime());
  resultado.setUTCDate(resultado.getUTCDate() + dias);
  return resultado;
}

/** Ordena por `ocorridoEm` (data ausente vai para o início); empate por `transacaoId`
 *  (determinístico, nunca depende da ordem de chegada/iteração do banco). */
function ordemFold(a: TransacaoParaFold, b: TransacaoParaFold): number {
  const ta = a.ocorridoEm?.getTime() ?? Number.NEGATIVE_INFINITY;
  const tb = b.ocorridoEm?.getTime() ?? Number.NEGATIVE_INFINITY;
  if (ta !== tb) return ta - tb;
  return a.transacaoId < b.transacaoId ? -1 : a.transacaoId > b.transacaoId ? 1 : 0;
}

/**
 * Fold **puro e determinístico** (Princípio V) sobre as transações já
 * qualificadas (`VENDA_PROPRIA`/`RECORRENCIA`/`REEMBOLSO`, filtradas pelo
 * executor — CL-02 do spec) de 1 contrato. Recalcula tudo do zero a cada
 * chamada — nunca aplica delta sobre um estado anterior. Sem I/O, sem
 * dependência de tempo (quem calcula "agora" é `contratos/domain/status-contrato`,
 * na leitura).
 *
 * Rótulo do aditivo (FR-006 / spec CL-03): `COMPRA_INICIAL` (nunca teve acesso),
 * `RENOVACAO` (tinha e expirou), `PRORROGACAO` (ainda ativo), `REEMBOLSO`
 * (classificação de estorno) ou `SEM_EFEITO` (não concede nem retira acesso —
 * inclui falta de dado para decidir, marcado `precisaRevisao`).
 */
export function foldContrato(transacoes: readonly TransacaoParaFold[]): ResultadoFold {
  const ordenadas = [...transacoes].sort(ordemFold);

  let fimAcessoAtual: Date | null = null;
  const ticketTotal: Record<string, bigint> = {};
  const valorRecebido: Record<string, bigint> = {};
  const aditivos: AditivoFold[] = [];

  for (const t of ordenadas) {
    if (
      (t.classificacao === Classificacao.VENDA_PROPRIA ||
        t.classificacao === Classificacao.RECORRENCIA) &&
      t.valorBruto
    ) {
      somarNoDict(ticketTotal, t.valorBruto);
    }
    if (contaComoReceita(t.statusCanonico as unknown as StatusTransacaoCanonicoCore)) {
      const recebido = t.valorLiquido ?? t.valorBruto;
      if (recebido) somarNoDict(valorRecebido, recebido);
    }

    let rotulo: AditivoRotulo;
    let precisaRevisao = false;
    let motivoRevisao: string | null = null;

    if (t.classificacao === Classificacao.REEMBOLSO) {
      rotulo = AditivoRotulo.REEMBOLSO;
    } else if (t.ocorridoEm == null) {
      rotulo = AditivoRotulo.SEM_EFEITO;
      precisaRevisao = true;
      motivoRevisao = 'data da transação não resolvida — aditivo sem efeito sobre o acesso';
    } else if (!liberaAcesso(t.statusCanonico as unknown as StatusTransacaoCanonicoCore)) {
      rotulo = AditivoRotulo.SEM_EFEITO;
    } else if (t.tempoAcessoDias == null) {
      rotulo = AditivoRotulo.SEM_EFEITO;
      precisaRevisao = true;
      motivoRevisao = 'tempo de acesso não cadastrado na oferta (oferta_catalogo.tempoAcessoDias)';
    } else {
      const baseline = fimAcessoAtual;
      const estendeVigente = baseline != null && t.ocorridoEm.getTime() <= baseline.getTime();
      rotulo = baseline == null
        ? AditivoRotulo.COMPRA_INICIAL
        : estendeVigente
          ? AditivoRotulo.PRORROGACAO
          : AditivoRotulo.RENOVACAO;
      const referencia = estendeVigente ? (baseline as Date) : t.ocorridoEm;
      fimAcessoAtual = somarDias(referencia, t.tempoAcessoDias);
    }

    aditivos.push({
      transacaoId: t.transacaoId,
      rotulo,
      fimAcessoResultante: fimAcessoAtual,
      precisaRevisao,
      motivoRevisao,
    });
  }

  return { fimAcesso: fimAcessoAtual, ticketTotal, valorRecebido, aditivos };
}
