/**
 * `StatusContratoCanonico` — estado canônico de um Contrato.
 *
 * Decisão do dono do produto (spec 002 §Clarifications): 4 estados. O rótulo
 * renovação/prorrogação **não** é um valor deste enum — é derivado do estado de
 * acesso na data do aditivo (visão Parte 7). A janela de tolerância de atraso
 * também não é estado: é aplicada na leitura pelo contexto `contratos` (spec 025).
 */
export enum StatusContratoCanonico {
  ATIVO = 'ATIVO',
  EXPIRADO = 'EXPIRADO',
  CANCELADO = 'CANCELADO',
  DESCONHECIDO = 'DESCONHECIDO',
}

/** Todos os valores, na ordem canônica. Imutável. */
export const STATUS_CONTRATO_CANONICO: readonly StatusContratoCanonico[] = Object.freeze([
  StatusContratoCanonico.ATIVO,
  StatusContratoCanonico.EXPIRADO,
  StatusContratoCanonico.CANCELADO,
  StatusContratoCanonico.DESCONHECIDO,
]);

/**
 * O contrato libera acesso agora? Só `ATIVO`. A eventual tolerância sobre um
 * `EXPIRADO` recente é decisão de leitura do contexto `contratos`, não desta
 * função pura.
 */
export function contratoLiberaAcesso(status: StatusContratoCanonico): boolean {
  switch (status) {
    case StatusContratoCanonico.ATIVO:
      return true;
    case StatusContratoCanonico.EXPIRADO:
    case StatusContratoCanonico.CANCELADO:
    case StatusContratoCanonico.DESCONHECIDO:
      return false;
    default: {
      const _exaustivo: never = status;
      return _exaustivo;
    }
  }
}
