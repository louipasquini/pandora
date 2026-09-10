import { Dinheiro, type EventoCanonico } from '../../core/core.module';

/**
 * Campos normalizados de uma `transacao` extraídos **só** do `EventoCanonico`
 * (puro, sem banco). Os campos que vêm de outras etapas (`statusCanonico`,
 * `classificacao`, `ocorridoEm`, `pessoaId`, `ehAfiliada`) são combinados pelo
 * executor da etapa 3 em `SnapshotTransacao`.
 */
export interface DadosCanonicos {
  valorBruto: Dinheiro | null;
  valorLiquido: Dinheiro | null;
  taxas: Dinheiro | null;
  reembolso: Dinheiro | null;
  quantidade: number | null;
  ehRecorrencia: boolean;
  assinaturaCiclo: string | null;
  numeroCiclo: number | null;
  ofertaCodigoOrigem: string | null;
  ofertaNomeOrigem: string | null;
}

/** Estado completo comparável de uma `transacao` (para o _diff_ `campos_alterados`). */
export interface SnapshotTransacao extends DadosCanonicos {
  statusCanonico: string;
  classificacao: string;
  ocorridoEm: Date | null;
  pessoaId: string | null;
  ehAfiliada: boolean;
}

type DinheiroCanonico = { valorInteiro: bigint; moeda: string } | undefined;

function paraDinheiro(v: DinheiroCanonico): Dinheiro | null {
  if (!v) return null;
  return Dinheiro.deInteiroEscalado(v.valorInteiro, v.moeda);
}

/** Extrai os campos que dependem só do `EventoCanonico`. Ausência → `null`/`false`. */
export function extrairCanonicos(canonico: EventoCanonico | null): DadosCanonicos {
  const valores = canonico?.valores;
  const assinatura = canonico?.assinatura;
  const oferta = canonico?.oferta;
  return {
    valorBruto: paraDinheiro(valores?.bruto),
    valorLiquido: paraDinheiro(valores?.liquido),
    taxas: paraDinheiro(valores?.taxas),
    reembolso: paraDinheiro(valores?.reembolso),
    quantidade: oferta?.quantidade ?? null,
    ehRecorrencia:
      assinatura?.ehRecorrencia === true || (assinatura?.numeroCiclo ?? 0) > 1,
    assinaturaCiclo: assinatura?.ciclo ?? null,
    numeroCiclo: assinatura?.numeroCiclo ?? null,
    ofertaCodigoOrigem: oferta?.codigoOrigem ?? null,
    ofertaNomeOrigem: oferta?.nomeOrigem ?? null,
  };
}
