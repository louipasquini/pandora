import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { apiFetch } from '../auth/api-client';
import { usePodeUsar } from '../auth/usePermissoes';
import {
  disparosApi,
  STATUS_DISPARO_ROTULO,
  STATUS_MENSAGEM_ROTULO,
  type MensagemDisparoStatus,
} from './disparos-api';

async function baixarExport(id: string, nome: string) {
  const res = await apiFetch(disparosApi.exportarUrl(id));
  const texto = await res.text();
  const blob = new Blob([texto], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `disparo-${nome.replace(/\s+/g, '-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Detalhe de um disparo (spec 015) — métricas, falhas, export, cancelar. */
export function DisparoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { pode: podeCancelar } = usePodeUsar('disparo:cancelar');
  const [filtroStatus, setFiltroStatus] = useState<MensagemDisparoStatus | ''>('');
  const [qualityRating, setQualityRating] = useState<string | null>(null);
  const [qualityErro, setQualityErro] = useState<string | null>(null);

  const disparo = useQuery({
    queryKey: ['disparos', 'detalhe', id],
    queryFn: () => disparosApi.obter(id as string),
    enabled: !!id,
  });

  const destinatarios = useQuery({
    queryKey: ['disparos', 'destinatarios', id, filtroStatus],
    queryFn: () =>
      disparosApi.listarDestinatarios(id as string, {
        status: filtroStatus || undefined,
        tamanho: 100,
      }),
    enabled: !!id,
  });

  const cancelar = useMutation({
    mutationFn: () => disparosApi.cancelar(id as string),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['disparos', 'detalhe', id] }),
  });

  const consultarQuality = useMutation({
    mutationFn: () => disparosApi.qualityRating((disparo.data as { canalId: string }).canalId),
    onSuccess: (r) => {
      setQualityRating(`${r.qualityRating}${r.statusExibicao ? ` (${r.statusExibicao})` : ''}`);
      setQualityErro(null);
    },
    onError: () => setQualityErro('não foi possível consultar o quality rating'),
  });

  if (disparo.isLoading) return <p className="text-sm text-slate-500">Carregando…</p>;
  if (disparo.isError || !disparo.data)
    return <p className="text-sm text-brand-coral">Não foi possível carregar o disparo.</p>;

  const d = disparo.data;

  return (
    <section className="max-w-4xl">
      <h1 className="text-xl font-semibold text-slate-800">{d.nome}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {STATUS_DISPARO_ROTULO[d.status]}
        {d.agendadoPara ? ` · agendado para ${new Date(d.agendadoPara).toLocaleString()}` : ''}
        {d.erroDetalhe ? ` · erro: ${d.erroDetalhe}` : ''}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {podeCancelar && d.status === 'AGENDADO' && (
          <button
            type="button"
            onClick={() => cancelar.mutate()}
            className="rounded-md border border-brand-coral px-3 py-1.5 text-sm text-brand-coral"
          >
            Cancelar disparo
          </button>
        )}
        <button
          type="button"
          onClick={() => void baixarExport(d.id, d.nome)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600"
        >
          Exportar resultado (CSV)
        </button>
        <button
          type="button"
          onClick={() => consultarQuality.mutate()}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600"
        >
          Consultar quality rating do canal
        </button>
        {qualityRating && <span className="self-center text-sm text-slate-600">{qualityRating}</span>}
        {qualityErro && <span className="self-center text-sm text-brand-coral">{qualityErro}</span>}
      </div>

      <h2 className="mt-6 text-sm font-medium text-slate-700">Resultados</h2>
      <ul className="mt-2 flex flex-wrap gap-3 text-sm text-slate-600">
        {d.contagens.map((c) => (
          <li key={c.status} className="rounded-md border border-slate-200 px-3 py-1">
            {STATUS_MENSAGEM_ROTULO[c.status as MensagemDisparoStatus] ?? c.status}: {c.total}
          </li>
        ))}
      </ul>

      {d.contagensPorVariante.some((c) => c.variante) && (
        <>
          <h3 className="mt-4 text-sm font-medium text-slate-700">Por variante (teste A/B)</h3>
          <ul className="mt-2 flex flex-wrap gap-3 text-sm text-slate-600">
            {d.contagensPorVariante
              .filter((c) => c.variante)
              .map((c) => (
                <li key={`${c.variante}-${c.status}`} className="rounded-md border border-slate-200 px-3 py-1">
                  {c.variante}/{STATUS_MENSAGEM_ROTULO[c.status as MensagemDisparoStatus] ?? c.status}: {c.total}
                </li>
              ))}
          </ul>
        </>
      )}

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-700">Destinatários</h2>
        <select
          aria-label="Filtrar destinatários por status"
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value as MensagemDisparoStatus | '')}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="">todos</option>
          {Object.entries(STATUS_MENSAGEM_ROTULO).map(([v, r]) => (
            <option key={v} value={v}>
              {r}
            </option>
          ))}
        </select>
      </div>

      {destinatarios.data && (
        <table className="mt-2 w-full text-left text-sm">
          <thead className="text-xs text-slate-400">
            <tr>
              <th className="py-1">Telefone</th>
              <th className="py-1">Status</th>
              <th className="py-1">Variante</th>
              <th className="py-1">Motivo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {destinatarios.data.itens.map((m) => (
              <tr key={m.id}>
                <td className="py-1">{m.telefone}</td>
                <td className="py-1">{STATUS_MENSAGEM_ROTULO[m.status]}</td>
                <td className="py-1">{m.variante ?? '—'}</td>
                <td className="py-1 text-slate-500">{m.motivo ?? '—'}</td>
              </tr>
            ))}
            {destinatarios.data.itens.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-slate-400">
                  nenhum destinatário ainda
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}
