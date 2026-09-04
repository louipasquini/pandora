import { formatarDinheiro, type OportunidadeView } from './pipelines-api';

/** Card de uma oportunidade no board Kanban (spec 010, US7). */
export function OportunidadeCard({
  oportunidade,
  arrastavel,
  onDragStart,
}: {
  oportunidade: OportunidadeView;
  arrastavel: boolean;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      draggable={arrastavel}
      onDragStart={onDragStart}
      data-testid={`oportunidade-${oportunidade.id}`}
      className="cursor-default rounded-md border border-slate-200 bg-white p-2.5 text-sm shadow-sm"
      style={arrastavel ? { cursor: 'grab' } : undefined}
    >
      <p className="font-medium text-slate-800">{oportunidade.titulo}</p>
      <p className="mt-1 text-xs text-slate-500">{formatarDinheiro(oportunidade.valorEstimado)}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {oportunidade.slaEstourado && (
          <span className="rounded-full bg-brand-coral/10 px-2 py-0.5 text-[11px] font-medium text-brand-coral">
            SLA estourado
          </span>
        )}
        {oportunidade.esfriando && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
            esfriando
          </span>
        )}
      </div>
    </div>
  );
}
