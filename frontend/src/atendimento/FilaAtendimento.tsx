import { PRIORIDADE_ROTULO, STATUS_ROTULO, type AtendimentoView } from './atendimento-api';

/**
 * Fila de atendimento (spec 012, US1/US2, D-06) — o `GET /crm/atendimentos`
 * já devolve os itens ordenados por prioridade e ordem de chegada
 * (`ordenarFila`, domínio puro). O indicador de SLA (`sla.estourado`) é
 * sempre calculado pelo backend em cada leitura — nunca uma coluna que possa
 * ficar desatualizada.
 */
export function FilaAtendimento({
  itens,
  selecionadoId,
  onSelecionar,
}: {
  itens: AtendimentoView[];
  selecionadoId: string | null;
  onSelecionar: (id: string) => void;
}) {
  if (itens.length === 0) {
    return <p className="p-4 text-sm text-slate-500">Nenhum atendimento na fila.</p>;
  }

  return (
    <ul className="divide-y divide-slate-100 overflow-y-auto">
      {itens.map((a) => (
        <li key={a.id}>
          <button
            type="button"
            onClick={() => onSelecionar(a.id)}
            className={[
              'flex w-full flex-col gap-1 px-3 py-2.5 text-left text-sm',
              selecionadoId === a.id ? 'bg-slate-100' : 'hover:bg-slate-50',
            ].join(' ')}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-slate-800">
                {a.pessoaId ? `Pessoa ${a.pessoaId.slice(0, 8)}` : `Lead ${a.leadId?.slice(0, 8)}`}
              </span>
              {a.prioridade !== 'NORMAL' && (
                <span
                  className={[
                    'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                    a.prioridade === 'URGENTE' ? 'bg-brand-coral/20 text-brand-coral' : 'bg-amber-100 text-amber-700',
                  ].join(' ')}
                >
                  {PRIORIDADE_ROTULO[a.prioridade]}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>{a.canal === 'WHATSAPP' ? 'WhatsApp' : 'Manual'}</span>
              <span>·</span>
              <span>{STATUS_ROTULO[a.status]}</span>
              {a.status !== 'ENCERRADO' &&
                (a.sla.estourado ? (
                  <span className="font-medium text-brand-coral">SLA estourado</span>
                ) : a.sla.minutosRestantes != null ? (
                  <span>{a.sla.minutosRestantes} min p/ SLA</span>
                ) : null)}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
