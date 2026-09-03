import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePodeUsar } from '../auth/usePermissoes';
import { crmAdminApi, DIAS, type JanelaView } from './crm-admin-api';

/** Aba Expediente: janelas + feriados + indicador "no expediente agora?". */
export function ExpedienteTab() {
  const qc = useQueryClient();
  const { pode: podeEditar } = usePodeUsar('crm_admin:gerir_expediente');

  const janelas = useQuery({
    queryKey: ['crm-admin', 'janelas'],
    queryFn: () => crmAdminApi.listarJanelas(),
  });
  const feriados = useQuery({
    queryKey: ['crm-admin', 'feriados'],
    queryFn: () => crmAdminApi.listarFeriados(),
  });
  const agora = useQuery({
    queryKey: ['crm-admin', 'expediente-agora'],
    queryFn: () => crmAdminApi.expediente({}),
  });

  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: ['crm-admin', 'janelas'] });
    void qc.invalidateQueries({ queryKey: ['crm-admin', 'feriados'] });
    void qc.invalidateQueries({ queryKey: ['crm-admin', 'expediente-agora'] });
  };

  const [dia, setDia] = useState(1);
  const [ini, setIni] = useState('09:00');
  const [fim, setFim] = useState('18:00');
  const [erroJanela, setErroJanela] = useState<string | null>(null);
  const criarJanela = useMutation({
    mutationFn: () =>
      crmAdminApi.criarJanela({ equipeId: null, diaSemana: dia, horaInicio: ini, horaFim: fim }),
    onSuccess: () => {
      setErroJanela(null);
      invalidar();
    },
    onError: () => setErroJanela('hora final deve ser maior que a inicial'),
  });

  const [data, setData] = useState('');
  const [desc, setDesc] = useState('');
  const [rec, setRec] = useState(false);
  const criarFeriado = useMutation({
    mutationFn: () =>
      crmAdminApi.criarFeriado({ equipeId: null, data, descricao: desc, recorrenteAnual: rec }),
    onSuccess: () => {
      setData('');
      setDesc('');
      invalidar();
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <p
        role="status"
        className={[
          'rounded-md px-4 py-2 text-sm font-medium',
          agora.data?.emExpediente
            ? 'bg-emerald-100 text-emerald-800'
            : 'bg-slate-100 text-slate-600',
        ].join(' ')}
      >
        {agora.isLoading
          ? 'Consultando…'
          : agora.data?.emExpediente
            ? '✅ No expediente agora'
            : '⛔ Fora do expediente agora'}
      </p>

      <div>
        <h2 className="text-sm font-semibold text-slate-700">Janelas de atendimento</h2>
        {podeEditar && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              criarJanela.mutate();
            }}
            className="mt-2 flex flex-wrap items-end gap-2"
          >
            <select
              aria-label="Dia da semana"
              value={dia}
              onChange={(e) => setDia(Number(e.target.value))}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              {DIAS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
            <input
              aria-label="Hora início"
              value={ini}
              onChange={(e) => setIni(e.target.value)}
              className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
            <input
              aria-label="Hora fim"
              value={fim}
              onChange={(e) => setFim(e.target.value)}
              className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
            <button
              type="submit"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
              style={{ background: 'var(--color-brand-azul)' }}
            >
              Adicionar janela
            </button>
            {erroJanela && <span className="text-xs text-brand-coral">{erroJanela}</span>}
          </form>
        )}
        <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {(janelas.data?.itens ?? []).length === 0 && (
            <li className="px-4 py-4 text-sm text-slate-500">Nenhuma janela.</li>
          )}
          {(janelas.data?.itens ?? []).map((j: JanelaView) => (
            <li key={j.id} className="flex items-center justify-between px-4 py-2 text-sm">
              <span>
                {DIAS[j.diaSemana]} · {j.horaInicio}–{j.horaFim}
                {j.equipeId ? ' · (equipe)' : ' · (global)'}
              </span>
              {podeEditar && (
                <button
                  type="button"
                  onClick={() =>
                    crmAdminApi.removerJanela(j.id).then(invalidar)
                  }
                  className="text-xs text-brand-coral hover:underline"
                >
                  remover
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-700">Feriados</h2>
        {podeEditar && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (data && desc.trim()) criarFeriado.mutate();
            }}
            className="mt-2 flex flex-wrap items-end gap-2"
          >
            <input
              aria-label="Data do feriado"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
            <input
              aria-label="Descrição"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="descrição"
              className="w-48 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
            <label className="flex items-center gap-1 text-xs text-slate-500">
              <input type="checkbox" checked={rec} onChange={(e) => setRec(e.target.checked)} />
              recorrente
            </label>
            <button
              type="submit"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
              style={{ background: 'var(--color-brand-azul)' }}
            >
              Adicionar feriado
            </button>
          </form>
        )}
        <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {(feriados.data?.itens ?? []).length === 0 && (
            <li className="px-4 py-4 text-sm text-slate-500">Nenhum feriado.</li>
          )}
          {(feriados.data?.itens ?? []).map((f) => (
            <li key={f.id} className="flex items-center justify-between px-4 py-2 text-sm">
              <span>
                {f.data} · {f.descricao}
                {f.recorrenteAnual ? ' · anual' : ''}
              </span>
              {podeEditar && (
                <button
                  type="button"
                  onClick={() => crmAdminApi.removerFeriado(f.id).then(invalidar)}
                  className="text-xs text-brand-coral hover:underline"
                >
                  remover
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
