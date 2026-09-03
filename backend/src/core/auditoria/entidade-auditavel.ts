/**
 * Contrato de auditoria de tempo para **toda** entidade de negócio futura
 * (Padrão Transversal "Auditoria": `criado_em` / `atualizado_em` em tudo).
 *
 * Semântica:
 * - `criadoEm`: definido na criação da entidade; **nunca** muda.
 * - `atualizadoEm`: definido na criação (= `criadoEm`); toda escrita persistida
 *   subsequente atualiza para o instante da escrita.
 *
 * Ambos são instantes UTC (equivalentes a `timestamptz`). Use `agoraUtc()` do
 * `core/tempo` como fonte do carimbo.
 *
 * Esta spec (002) entrega apenas o **contrato** — nenhuma entidade nem tabela.
 */
export interface EntidadeAuditavel {
  readonly criadoEm: Date;
  readonly atualizadoEm: Date;
}

/**
 * Lembrete de convenção para os schemas Prisma das próximas specs: colunas de
 * tempo usam `@db.Timestamptz` (nunca `@db.Timestamp` — evita naive).
 */
export const TIMESTAMPTZ_PRISMA = '@db.Timestamptz' as const;
