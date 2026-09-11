import { StatusContratoCanonico } from '@prisma/client';
import {
  contratoLiberaAcesso,
  type StatusContratoCanonico as StatusContratoCanonicoCore,
} from '../../core/core.module';

export interface AjusteManualVigente {
  status: StatusContratoCanonico;
}

export interface EntradaStatusContrato {
  fimAcesso: Date | null;
  toleranciaAtrasoDias: number;
  /** `null` quando não há ajuste manual vigente (nunca gravado, ou já limpo pelo fold). */
  ajusteManual: AjusteManualVigente | null;
  agora: Date;
}

export interface ResultadoStatusContrato {
  statusCanonico: StatusContratoCanonico;
  acessoLiberado: boolean;
  /** `true` → o valor vem do ajuste manual (CL-01), não do `fimAcesso`. */
  viaAjusteManual: boolean;
}

/**
 * `status_canonico`/`acesso_liberado` de um Contrato são **funções de leitura**
 * (Princípio V) — nunca colunas persistidas: um contrato cujo `fimAcesso` já
 * passou não deveria continuar `ATIVO` só porque nenhuma transação nova chegou
 * para "recalcular" (o relógio, não um evento, muda esse estado).
 *
 * Precedência (CL-01 do spec — exceção deliberada à regra geral "curado >
 * derivado" das specs 007/023): um ajuste manual vigente **vence** aqui, mas só
 * até o próximo fold — quem o limpa é o executor da etapa 6, não esta função.
 */
export function statusDoContrato(entrada: EntradaStatusContrato): ResultadoStatusContrato {
  if (entrada.ajusteManual != null) {
    const status = entrada.ajusteManual.status;
    return {
      statusCanonico: status,
      acessoLiberado: contratoLiberaAcesso(status as unknown as StatusContratoCanonicoCore),
      viaAjusteManual: true,
    };
  }

  if (entrada.fimAcesso == null) {
    return {
      statusCanonico: StatusContratoCanonico.DESCONHECIDO,
      acessoLiberado: false,
      viaAjusteManual: false,
    };
  }

  const limite = new Date(entrada.fimAcesso.getTime());
  limite.setUTCDate(limite.getUTCDate() + Math.max(0, entrada.toleranciaAtrasoDias));

  const status =
    entrada.agora.getTime() <= limite.getTime()
      ? StatusContratoCanonico.ATIVO
      : StatusContratoCanonico.EXPIRADO;

  return {
    statusCanonico: status,
    acessoLiberado: contratoLiberaAcesso(status as unknown as StatusContratoCanonicoCore),
    viaAjusteManual: false,
  };
}
