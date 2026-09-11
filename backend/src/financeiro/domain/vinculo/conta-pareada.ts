import { PlataformaOrigem } from '../../../core/core.module';

/**
 * Pareamento de conta Asaas↔Guru (spec 024, CL-01) — mapa **fechado**, mesmo padrão de
 * `ESTRATEGIA_RESOLUCAO_OFERTA` (catalogo/023) e `MAPAS_STATUS` (financeiro/018):
 * "estratégia por conta é dado, não `if`". Nunca cruza PRD↔SVC — cada dupla é um
 * contexto de negócio separado (decisão do dono do produto, 2026-09-11).
 *
 * Devolve `string` (não o enum) de propósito — quem chama compara/repassa como
 * valor de `PlataformaOrigem`, seja o do `core` ou o do `@prisma/client` (dois
 * enums TS nominalmente distintos com os mesmos valores); manter a função pura
 * livre desse acoplamento evita cast nos dois sentidos.
 */
const GURU_PAR: Readonly<Record<string, string>> = Object.freeze({
  [PlataformaOrigem.ASAAS_PRD]: PlataformaOrigem.GURU_PRD,
  [PlataformaOrigem.ASAAS_SVC]: PlataformaOrigem.GURU_SVC,
});

const ASAAS_PAR: Readonly<Record<string, string>> = Object.freeze({
  [PlataformaOrigem.GURU_PRD]: PlataformaOrigem.ASAAS_PRD,
  [PlataformaOrigem.GURU_SVC]: PlataformaOrigem.ASAAS_SVC,
});

/** Conta Guru pareada de uma conta Asaas — `null` se `plataforma` não for Asaas. */
export function contaGuruParDe(plataforma: string): string | null {
  return GURU_PAR[plataforma] ?? null;
}

/** Conta Asaas pareada de uma conta Guru — `null` se `plataforma` não for Guru. */
export function contaAsaasParDe(plataforma: string): string | null {
  return ASAAS_PAR[plataforma] ?? null;
}
