import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { eventosApi, type EventoEtapaView } from './eventos-api';
import { ReprocessarButton } from './ReprocessarButton';

const ETAPA_BADGE: Record<string, string> = {
  ok: 'bg-emerald-100 text-emerald-700',
  erro: 'bg-red-100 text-red-700',
  bloqueada: 'bg-orange-100 text-orange-700',
  pulada: 'bg-slate-100 text-slate-500',
  pendente: 'bg-slate-100 text-slate-600',
  processando: 'bg-blue-100 text-blue-700',
};

function Etapa({ e }: { e: EventoEtapaView }) {
  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-slate-700">{e.etapa}</span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
            ETAPA_BADGE[e.status] ?? ETAPA_BADGE.pendente
          }`}
        >
          {e.status}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        tentativas: {e.tentativas}
        {e.executadoEm ? ` · ${new Date(e.executadoEm).toLocaleString()}` : ''}
        {e.erroDetalhe ? ` · ${e.erroDetalhe}` : ''}
      </p>
      {e.resultado != null && (
        <pre className="mt-1 overflow-x-auto rounded bg-slate-50 p-2 text-[11px] text-slate-600">
          {JSON.stringify(e.resultado)}
        </pre>
      )}
    </li>
  );
}

/** Detalhe de um evento de ingestão (spec 006) — payload cru + linha do tempo das etapas. */
export function EventoDetailPage() {
  const { id = '' } = useParams();
  const q = useQuery({
    queryKey: ['evento', id],
    queryFn: () => eventosApi.detalhe(id),
  });

  if (q.isLoading) return <p className="p-6 text-sm text-slate-500">Carregando…</p>;
  if (q.isError || !q.data)
    return (
      <section className="max-w-2xl p-6">
        <p className="text-sm text-brand-coral">Evento não encontrado.</p>
        <Link to="/eventos" className="mt-4 inline-block text-sm text-brand-azul hover:underline">
          ← voltar
        </Link>
      </section>
    );

  const e = q.data;

  return (
    <section className="max-w-3xl">
      <Link to="/eventos" className="text-sm text-brand-azul hover:underline">
        ← Eventos
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">
            {e.plataformaOrigem} · {e.tipoOrigem}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            id de origem <span className="font-mono">{e.idOrigem}</span> · status{' '}
            <strong>{e.status}</strong>
            {e.classificacao ? ` · ${e.classificacao}` : ''}
            {e.reentregas > 0 ? ` · ${e.reentregas} reentrega(s)` : ''}
          </p>
          {e.erroDetalhe && (
            <p className="mt-1 text-xs text-brand-coral">{e.erroDetalhe}</p>
          )}
        </div>
        <ReprocessarButton eventoId={e.id} />
      </div>

      <h2 className="mt-6 text-sm font-semibold text-slate-700">Etapas do pipeline</h2>
      <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
        {e.etapas.map((et) => (
          <Etapa key={et.etapa} e={et} />
        ))}
      </ul>

      <h2 className="mt-6 text-sm font-semibold text-slate-700">Payload bruto</h2>
      <pre className="mt-2 max-h-96 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
        {JSON.stringify(e.payloadBruto, null, 2)}
      </pre>

      {e.eventoCanonico != null && (
        <>
          <h2 className="mt-6 text-sm font-semibold text-slate-700">EventoCanonico</h2>
          <pre className="mt-2 max-h-96 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            {JSON.stringify(e.eventoCanonico, null, 2)}
          </pre>
        </>
      )}
    </section>
  );
}
