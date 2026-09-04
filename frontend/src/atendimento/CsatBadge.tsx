import type { InteracaoView } from './atendimento-api';

/**
 * CSAT (spec 012, D-R5) — não é uma entidade nova: é a `interacao` tipo
 * `NPS` já existente desde a 009, encontrada na timeline do atendimento.
 */
export function CsatBadge({ timeline }: { timeline: InteracaoView[] | undefined }) {
  const nps = timeline?.find((i) => i.tipo === 'NPS');
  if (!nps) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"
      title={nps.conteudo}
    >
      CSAT {nps.notaNps}/10
    </span>
  );
}
