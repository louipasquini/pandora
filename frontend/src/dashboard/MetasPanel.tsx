import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePodeUsar } from '../auth/usePermissoes';
import {
  METRICAS_META,
  dashboardApi,
  fmtPct,
  mensagemErro,
  type MetaStatus,
  type MetaView,
} from './dashboard-api';

const STATUS_COR: Record<MetaStatus, string> = {
  no_caminho: 'bg-brand-menta/20 text-emerald-700',
  em_risco: 'bg-amber-100 text-amber-700',
  batida: 'bg-brand-azul/10 text-brand-azul',
  estourada: 'bg-brand-coral/10 text-brand-coral',
};
const STATUS_ROTULO: Record<MetaStatus, string> = {
  no_caminho: 'No caminho',
  em_risco: 'Em risco',
  batida: 'Batida',
  estourada: 'Estourada',
};

function valorLegivel(v: MetaView['alvo']): string {
  return 'moeda' in v
    ? `${v.moeda} ${(Number(BigInt(v.valorInt)) / 10000).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    : String(v.valor);
}

function NovaMetaForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [metrica, setMetrica] = useState('oportunidades_ganhas');
  const [periodo, setPeriodo] = useState<'MES' | 'TRIMESTRE'>('MES');
  const [referencia, setReferencia] = useState(new Date().toISOString().slice(0, 10));
  const [valor, setValor] = useState('');
  const [moeda, setMoeda] = useState('BRL');
  const [erro, setErro] = useState<string | null>(null);
  const monetaria = METRICAS_META.find((m) => m.id === metrica)?.monetaria ?? false;

  const criar = useMutation({
    mutationFn: () =>
      dashboardApi.criarMeta({
        metrica,
        periodo,
        referencia,
        alvo: monetaria
          ? { valorInt: String(Math.round(Number(valor) * 10000)), moeda }
          : { valor: Number(valor) },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dashboard-metas'] });
      void qc.invalidateQueries({ queryKey: ['dashboard-notificacoes-meta'] });
      onClose();
    },
    onError: (e) => setErro(mensagemErro(e)),
  });

  return (
    <form
      className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        criar.mutate();
      }}
    >
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Métrica"
          value={metrica}
          onChange={(e) => setMetrica(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        >
          {METRICAS_META.map((m) => (
            <option key={m.id} value={m.id}>
              {m.rotulo}
            </option>
          ))}
        </select>
        <select
          aria-label="Período"
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value as 'MES' | 'TRIMESTRE')}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        >
          <option value="MES">Mês</option>
          <option value="TRIMESTRE">Trimestre</option>
        </select>
        <input
          type="date"
          aria-label="Referência"
          value={referencia}
          onChange={(e) => setReferencia(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        />
        <input
          type="number"
          aria-label="Alvo"
          placeholder="Alvo"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className="w-28 rounded border border-slate-300 px-2 py-1 text-sm"
          required
        />
        {monetaria && (
          <input
            aria-label="Moeda"
            value={moeda}
            onChange={(e) => setMoeda(e.target.value.toUpperCase())}
            maxLength={3}
            className="w-16 rounded border border-slate-300 px-2 py-1 text-sm uppercase"
          />
        )}
      </div>
      {erro && <p className="text-xs text-brand-coral">{erro}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={criar.isPending}
          className="rounded bg-brand-azul px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
        >
          Criar meta
        </button>
        <button type="button" onClick={onClose} className="px-3 py-1 text-sm text-slate-500">
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function MetasPanel() {
  const qc = useQueryClient();
  const { pode: podeGerir } = usePodeUsar('dashboard:gerir_metas');
  const [novo, setNovo] = useState(false);
  const metas = useQuery({ queryKey: ['dashboard-metas'], queryFn: () => dashboardApi.metas() });

  const remover = useMutation({
    mutationFn: (id: string) => dashboardApi.removerMeta(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dashboard-metas'] });
      void qc.invalidateQueries({ queryKey: ['dashboard-notificacoes-meta'] });
    },
  });

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Metas comerciais</h2>
        {podeGerir && !novo && (
          <button
            onClick={() => setNovo(true)}
            className="text-sm font-medium text-brand-azul hover:underline"
          >
            + Nova meta
          </button>
        )}
      </div>
      {novo && <NovaMetaForm onClose={() => setNovo(false)} />}
      {metas.isLoading && <p className="text-sm text-slate-400">Carregando…</p>}
      {metas.data && metas.data.itens.length === 0 && !novo && (
        <p className="text-sm text-slate-400">Nenhuma meta no período corrente.</p>
      )}
      <ul className="mt-2 space-y-2">
        {metas.data?.itens.map((m) => {
          const pct = Math.min(1, m.percentual ?? 0);
          return (
            <li key={m.id} className="rounded-lg border border-slate-100 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">
                  {METRICAS_META.find((x) => x.id === m.metrica)?.rotulo ?? m.metrica}
                  <span className="ml-2 text-xs text-slate-400">
                    {m.periodo === 'MES' ? 'mês' : 'trimestre'} · {m.referencia}
                  </span>
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COR[m.status]}`}>
                  {STATUS_ROTULO[m.status]}
                </span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-100">
                <div
                  className="h-2 rounded-full bg-brand-azul"
                  style={{ width: `${pct * 100}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                <span>
                  {valorLegivel(m.realizado)} / {valorLegivel(m.alvo)} ({fmtPct(m.percentual)})
                </span>
                {podeGerir && (
                  <button
                    onClick={() => remover.mutate(m.id)}
                    className="text-brand-coral hover:underline"
                  >
                    remover
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
