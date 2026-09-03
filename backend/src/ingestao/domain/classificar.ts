import { Classificacao } from '@prisma/client';
import type { EventoCanonico } from './evento-canonico';

export interface ResultadoClassificacao {
  classificacao: Classificacao;
  /** true → o evento vai para `revisar` (nunca um palpite — regra inviolável #15). */
  revisar: boolean;
  motivo?: string;
}

const RE_ESTORNO = /(reembolso|estorno|refund|chargeback|charge_back|devolucao|devolução)/i;

/**
 * Etapa 1 do pipeline (spec 006). **Função pura e determinística** de
 * `EventoCanonico` + `tipoOrigem`. Aplica só as regras deriváveis **sem adapter**
 * (CL-03); o que depende de contexto cross-transação (casar Asaas↔Guru de fato)
 * fica `DESCONHECIDO` + `revisar` para as specs 024/026. **Nunca** um palpite.
 */
export function classificar(
  canonico: EventoCanonico | null,
  tipoOrigem: string,
): ResultadoClassificacao {
  if (canonico == null) {
    return {
      classificacao: Classificacao.DESCONHECIDO,
      revisar: true,
      motivo: 'sem EventoCanonico — adapter da plataforma ainda não implementado',
    };
  }

  // 1) Reembolso / estorno — por status de origem ou por tipo_origem.
  if (RE_ESTORNO.test(canonico.statusOrigem) || RE_ESTORNO.test(tipoOrigem)) {
    return { classificacao: Classificacao.REEMBOLSO, revisar: false };
  }

  // 2) Referência externa a uma transação de OUTRA plataforma → cobrança
  //    terceirizada. Cravar o vínculo Asaas↔Guru de fato é da spec 024.
  const ref = canonico.referenciaExterna;
  if (ref?.idOrigem && ref.plataforma && ref.plataforma !== canonico.plataformaOrigem) {
    return {
      classificacao: Classificacao.DESCONHECIDO,
      revisar: true,
      motivo:
        'referência externa a outra plataforma — vínculo Asaas↔Guru é resolvido na spec 024',
    };
  }

  // 3) Venda como afiliada — sinal explícito do adapter.
  if (canonico.ehAfiliada === true) {
    return { classificacao: Classificacao.VENDA_AFILIADA, revisar: false };
  }

  // 4) Recorrência / renovação de assinatura.
  const ass = canonico.assinatura;
  if (ass?.ehRecorrencia === true || (ass?.numeroCiclo ?? 0) > 1) {
    return { classificacao: Classificacao.RECORRENCIA, revisar: false };
  }

  // 5) Caso base.
  return { classificacao: Classificacao.VENDA_PROPRIA, revisar: false };
}
