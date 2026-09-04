import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { usePodeUsar } from '../auth/usePermissoes';
import { KanbanBoard } from './KanbanBoard';
import { MetricasPanel } from './MetricasPanel';
import { mensagemErro, pipelinesApi } from './pipelines-api';

/** CRM · Pipelines (spec 010, US1/US7) — seletor de pipeline + board Kanban. */
export function PipelinesPage() {
  const { pode: podeAdministrar } = usePodeUsar('crm_admin:gerir_pipelines');
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [mostrarMetricas, setMostrarMetricas] = useState(false);

  const pipelines = useQuery({
    queryKey: ['pipelines', true],
    queryFn: () => pipelinesApi.listar(true),
  });

  useEffect(() => {
    if (!pipelineId && pipelines.data && pipelines.data.itens.length > 0) {
      setPipelineId(pipelines.data.itens[0].id);
    }
  }, [pipelines.data, pipelineId]);

  return (
    <section>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">CRM · Pipelines</h1>
          <p className="mt-1 text-sm text-slate-500">
            Funis de venda, oportunidades e SLA por etapa.
          </p>
        </div>
        {podeAdministrar && (
          <div className="flex items-center gap-2">
            <NovoPipelineButton onCriou={(id) => setPipelineId(id)} />
            {pipelineId && (
              <Link
                to={`/crm/pipelines/${pipelineId}/admin`}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600"
              >
                Administrar
              </Link>
            )}
          </div>
        )}
      </div>

      {pipelines.isLoading && <p className="mt-6 text-sm text-slate-500">Carregando…</p>}
      {pipelines.isError && (
        <p className="mt-6 text-sm text-brand-coral">Não foi possível carregar os pipelines.</p>
      )}

      {pipelines.data && pipelines.data.itens.length > 0 && (
        <div className="mt-4 flex items-center gap-3">
          <label className="text-sm text-slate-600" htmlFor="pipeline-select">
            Pipeline
          </label>
          <select
            id="pipeline-select"
            value={pipelineId ?? ''}
            onChange={(e) => setPipelineId(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            {pipelines.data.itens.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setMostrarMetricas((v) => !v)}
            className="rounded-md px-3 py-1.5 text-sm text-brand-azul"
          >
            {mostrarMetricas ? 'ocultar métricas' : 'ver métricas'}
          </button>
        </div>
      )}

      {pipelines.data && pipelines.data.itens.length === 0 && (
        <p className="mt-6 text-sm text-slate-400">
          Nenhum pipeline ainda.
          {podeAdministrar ? ' Crie um para começar.' : ''}
        </p>
      )}

      {pipelineId && mostrarMetricas && (
        <div className="mt-4">
          <MetricasPanel pipelineId={pipelineId} />
        </div>
      )}

      {pipelineId && <KanbanBoard pipelineId={pipelineId} />}
    </section>
  );
}

function NovoPipelineButton({ onCriou }: { onCriou: (id: string) => void }) {
  const qc = useQueryClient();
  const [abrindo, setAbrindo] = useState(false);
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const criar = useMutation({
    mutationFn: () => pipelinesApi.criar({ nome }),
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: ['pipelines', true] });
      setAbrindo(false);
      setNome('');
      onCriou(p.id);
    },
    onError: (e: unknown) => setErro(mensagemErro(e)),
  });

  if (!abrindo) {
    return (
      <button
        type="button"
        onClick={() => setAbrindo(true)}
        className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
        style={{ background: 'var(--color-brand-azul)' }}
      >
        Novo pipeline
      </button>
    );
  }

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        criar.mutate();
      }}
    >
      <input
        aria-label="Nome do pipeline"
        required
        autoFocus
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="nome do pipeline"
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
      />
      <button
        type="submit"
        className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
        style={{ background: 'var(--color-brand-azul)' }}
      >
        Salvar
      </button>
      <button
        type="button"
        onClick={() => setAbrindo(false)}
        className="rounded-md px-3 py-1.5 text-sm text-slate-500"
      >
        cancelar
      </button>
      {erro && <span className="text-xs text-brand-coral">{erro}</span>}
    </form>
  );
}
