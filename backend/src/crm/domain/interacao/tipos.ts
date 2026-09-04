/**
 * Tipos do domínio `interacao` (spec 009). Puros — nenhum import de infra/Prisma
 * em runtime (só `import type`). Os enums são os mesmos do client Prisma.
 */
import type { InteracaoTipo as PrismaInteracaoTipo, InteracaoDirecao } from '@prisma/client';

export type { InteracaoDirecao };
export type InteracaoTipo = PrismaInteracaoTipo;

export const INTERACAO_TIPOS: readonly InteracaoTipo[] = [
  'WHATSAPP',
  'EMAIL',
  'LIGACAO',
  'TICKET',
  'NOTA',
  'NPS',
];

/** Chave de idempotência da porta `RegistrarInteracaoService`. */
export interface ChaveOrigemInteracao {
  canalOrigem: string;
  idExterno: string;
}

/** Motivos canônicos de uma linha de `crm_interacao_audit`. */
export type MotivoAuditoriaInteracao =
  | 'criar'
  | 'editar_nota'
  | 'remover_nota'
  | 'tag'
  | 'segmento_criado'
  | 'segmento_editado'
  | 'segmento_removido'
  | 'registrar_integracao';

/** Entrada de auditoria de `interacao`/`tag_associacao`(pessoa\|interacao)/`segmento`. */
export interface EntradaAuditoriaInteracao {
  autor: string;
  entidade: 'interacao' | 'tag_associacao' | 'segmento';
  entidadeId: string;
  campo: string;
  valorAnterior: unknown;
  valorNovo: unknown;
  motivo: MotivoAuditoriaInteracao;
}
