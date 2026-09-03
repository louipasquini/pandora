import { EtapaIngestao, EventoOrigemStatus } from '@prisma/client';
import { ETAPAS } from './etapas';
import type { AcaoEtapa, EtapaSnapshot } from './tipos';

export interface PlanoPassada {
  /** o que fazer com cada etapa nesta passada. */
  acoes: Map<EtapaIngestao, AcaoEtapa>;
  /** `status` do `evento_origem` derivado do estado atual das etapas. */
  statusEvento: EventoOrigemStatus;
}

/**
 * Núcleo puro do worker (spec 006). Dado o estado das `evento_etapa` de um evento
 * e o teto de tentativas, decide a ação de cada etapa e deriva o `status` do
 * evento. Sem I/O, determinística.
 *
 * Regras (por etapa, na ordem de `ETAPAS`):
 * - `ok` | `pulada` → `JA_OK` (nunca reexecuta).
 * - `erro` com `tentativas >= max` → `ESGOTADA` (não executa; contribui `erro`).
 * - alguma dependência declarada não está `ok`/`pulada` → `BLOQUEADA`.
 * - senão (`pendente` | `bloqueada` | `erro` com tentativas restantes) → `EXECUTAR`.
 */
export function planejarPassada(
  etapas: readonly EtapaSnapshot[],
  max: number,
): PlanoPassada {
  const porNome = new Map(etapas.map((e) => [e.etapa, e]));
  const acoes = new Map<EtapaIngestao, AcaoEtapa>();

  for (const def of ETAPAS) {
    const e = porNome.get(def.nome);
    if (!e) {
      acoes.set(def.nome, 'BLOQUEADA');
      continue;
    }
    if (e.status === 'ok' || e.status === 'pulada') {
      acoes.set(def.nome, 'JA_OK');
      continue;
    }
    if (e.status === 'erro' && e.tentativas >= max) {
      acoes.set(def.nome, 'ESGOTADA');
      continue;
    }
    const depsOk = def.dependeDe.every((d) => {
      const de = porNome.get(d);
      return de != null && (de.status === 'ok' || de.status === 'pulada');
    });
    acoes.set(def.nome, depsOk ? 'EXECUTAR' : 'BLOQUEADA');
  }

  return { acoes, statusEvento: derivarStatus(etapas, acoes) };
}

function derivarStatus(
  etapas: readonly EtapaSnapshot[],
  acoes: Map<EtapaIngestao, AcaoEtapa>,
): EventoOrigemStatus {
  const valores = [...acoes.values()];
  const temErro =
    etapas.some((e) => e.status === 'erro') || valores.includes('ESGOTADA');
  if (temErro) return EventoOrigemStatus.erro;
  if (etapas.some((e) => e.revisar === true)) return EventoOrigemStatus.revisar;
  const aindaVaiRodar =
    valores.includes('EXECUTAR') ||
    valores.includes('BLOQUEADA') ||
    etapas.some((e) => e.status === 'processando' || e.status === 'pendente');
  return aindaVaiRodar ? EventoOrigemStatus.pendente : EventoOrigemStatus.ok;
}
