import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { usePodeUsar } from '../auth/usePermissoes';
import { GATILHO_ROTULOS, mensagemErro, workflowApi, type ModeloView } from './workflow-api';

/** Biblioteca de automações prontas (spec 014, US4, CL-02) — só leitura + clonar. */
export function ModelosPage() {
  const { pode: podeGerir } = usePodeUsar('crm_admin:gerir_workflow');
  const modelos = useQuery({ queryKey: ['workflow', 'modelos'], queryFn: () => workflowApi.listarModelos() });
  const [usando, setUsando] = useState<ModeloView | null>(null);

  return (
    <section className="max-w-3xl">
      <h1 className="text-xl font-semibold text-slate-800">CRM · Workflow · Modelos</h1>
      <p className="mt-1 text-sm text-slate-500">
        Fluxos-modelo prontos, somente leitura — use como ponto de partida para um fluxo novo.
      </p>

      {modelos.isLoading && <p className="mt-6 text-sm text-slate-500">Carregando…</p>}
      {modelos.isError && (
        <p className="mt-6 text-sm text-brand-coral">Não foi possível carregar os modelos.</p>
      )}
      {modelos.data && (
        <ul className="mt-4 divide-y divide-slate-100 rounded border border-slate-200">
          {modelos.data.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-slate-800">{m.nome}</p>
                {m.descricao && <p className="text-xs text-slate-500">{m.descricao}</p>}
                <p className="text-xs text-slate-400">{GATILHO_ROTULOS[m.gatilhoTipo]}</p>
              </div>
              {podeGerir && (
                <button
                  type="button"
                  onClick={() => setUsando(m)}
                  className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                >
                  Usar como base
                </button>
              )}
            </li>
          ))}
          {modelos.data.length === 0 && (
            <li className="px-3 py-6 text-center text-slate-400">nenhum modelo disponível</li>
          )}
        </ul>
      )}

      {usando && <UsarComoBaseModal modelo={usando} onClose={() => setUsando(null)} />}
    </section>
  );
}

function UsarComoBaseModal({ modelo, onClose }: { modelo: ModeloView; onClose: () => void }) {
  const navigate = useNavigate();
  const [nome, setNome] = useState(`${modelo.nome} (cópia)`);
  const [erro, setErro] = useState<string | null>(null);

  const usar = useMutation({
    mutationFn: () => workflowApi.usarComoBase(modelo.id, { nome }),
    onSuccess: (fluxo) => navigate(`/crm/workflow/${fluxo.id}`),
    onError: (e: unknown) => setErro(mensagemErro(e)),
  });

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/30 p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (nome.trim()) usar.mutate();
        }}
        className="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg"
      >
        <h2 className="text-sm font-medium text-slate-700">Usar "{modelo.nome}" como base</h2>
        <input
          aria-label="Nome do novo fluxo"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        {erro && <p className="mt-2 text-sm text-brand-coral">{erro}</p>}
        <div className="mt-3 flex gap-2">
          <button
            type="submit"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
            style={{ background: 'var(--color-brand-azul)' }}
          >
            Criar fluxo
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
