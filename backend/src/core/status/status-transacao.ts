/**
 * `StatusTransacaoCanonico` — vocabulário único de status de um evento financeiro
 * (Padrão Transversal "Status" da constituição). Nenhuma regra de negócio conhece
 * o status bruto de uma plataforma; os adapters (specs 019–022) traduzem para
 * este enum, versionados por fonte.
 *
 * "Libera acesso?" e "conta como receita?" são **funções puras** deste enum —
 * são dois sistemas separados de propósito (Regra Inviolável nº 5), ambos
 * derivados de UM enum.
 */
export enum StatusTransacaoCanonico {
  PENDENTE = 'PENDENTE',
  PAGO = 'PAGO',
  EM_ATRASO = 'EM_ATRASO',
  RECUSADO = 'RECUSADO',
  CANCELADO = 'CANCELADO',
  ESTORNADO = 'ESTORNADO',
  CHARGEBACK = 'CHARGEBACK',
  DESCONHECIDO = 'DESCONHECIDO',
}

/** Todos os valores, na ordem canônica. Imutável. */
export const STATUS_TRANSACAO_CANONICO: readonly StatusTransacaoCanonico[] = Object.freeze([
  StatusTransacaoCanonico.PENDENTE,
  StatusTransacaoCanonico.PAGO,
  StatusTransacaoCanonico.EM_ATRASO,
  StatusTransacaoCanonico.RECUSADO,
  StatusTransacaoCanonico.CANCELADO,
  StatusTransacaoCanonico.ESTORNADO,
  StatusTransacaoCanonico.CHARGEBACK,
  StatusTransacaoCanonico.DESCONHECIDO,
]);

/**
 * O status libera acesso ao produto/curso?
 *
 * `PENDENTE` e `EM_ATRASO` liberam — o `core` é **permissivo**: não conhece a
 * janela de tolerância (config por contrato). Quem revoga o acesso quando a
 * tolerância expira é o contexto `contratos` (spec 025).
 */
export function liberaAcesso(status: StatusTransacaoCanonico): boolean {
  switch (status) {
    case StatusTransacaoCanonico.PAGO:
    case StatusTransacaoCanonico.PENDENTE:
    case StatusTransacaoCanonico.EM_ATRASO:
      return true;
    case StatusTransacaoCanonico.RECUSADO:
    case StatusTransacaoCanonico.CANCELADO:
    case StatusTransacaoCanonico.ESTORNADO:
    case StatusTransacaoCanonico.CHARGEBACK:
    case StatusTransacaoCanonico.DESCONHECIDO:
      return false;
    default: {
      const _exaustivo: never = status;
      return _exaustivo;
    }
  }
}

/**
 * O status conta como "dinheiro que entrou de fato"? Só `PAGO`. Usado apenas em
 * somas monetárias — nunca para decidir acesso.
 */
export function contaComoReceita(status: StatusTransacaoCanonico): boolean {
  switch (status) {
    case StatusTransacaoCanonico.PAGO:
      return true;
    case StatusTransacaoCanonico.PENDENTE:
    case StatusTransacaoCanonico.EM_ATRASO:
    case StatusTransacaoCanonico.RECUSADO:
    case StatusTransacaoCanonico.CANCELADO:
    case StatusTransacaoCanonico.ESTORNADO:
    case StatusTransacaoCanonico.CHARGEBACK:
    case StatusTransacaoCanonico.DESCONHECIDO:
      return false;
    default: {
      const _exaustivo: never = status;
      return _exaustivo;
    }
  }
}
