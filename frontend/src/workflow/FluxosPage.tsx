import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { usePodeUsar } from '../auth/usePermissoes';
import { GATILHO_ROTULOS, GATILHO_TIPOS, mensagemErro, workflowApi, type GatilhoTipo } from './workflow-api';

function statusFluxo(f: { versaoPublicada: unknown; versaoRascunho: unknown }): string {
  if (f.versaoPublicada && f.versaoRascunho) return 'publicado (com rascunho)';
  if (f.versaoPublicada) return 'publicado';
  if (f.versaoRascunho) return 'rascunho';
  return 'vazio';
}

/** Lista de fluxos de automação (spec 014, US1). */
export function FluxosPage() {
  const qc = useQueryClient();
  const { pode: podeGerir } = usePodeUsar('crm_admin:gerir_workflow');
  const lista = useQuery({ queryKey: ['workflow', 'fluxos'], queryFn: () => workflowApi.listarFluxos() });
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<{ nome: string; gatilhoTipo: GatilhoTipo }>({
    nome: '',
    gatilhoTipo: 'LEAD_CRIADO',
  });

  const criar = useMutation({
    mutationFn: () => workflowApi.criarFluxo(form),
    onSuccess: () => {
      setCriando(false);
      setForm({ nome: '', gatilhoTipo: 'LEAD_CRIADO' });
      setErro(null);
      void qc.invalidateQueries({ queryKey: ['workflow', 'fluxos'] });
    },
    onError: (e: unknown) => setErro(mensagemErro(e)),
  });

  return (
    <section className="max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">CRM · Workflow</h1>
          <p className="mt-1 text-sm text-slate-500">
            Motor de automação — gatilho, condições e ações. Publicar cria uma versão imutável;
            editar depois nunca afeta o que já está rodando.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link to="/crm/workflow/modelos" className="text-sm text-brand-azul hover:underline">
            Modelos
          </Link>
          {podeGerir && !criando && (
            <button
              type="button"
              onClick={() => setCriando(true)}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
              style={{ background: 'var(--color-brand-azul)' }}
            >
              Novo fluxo
            </button>
          )}
        </div>
      </div>

      {criando && podeGerir && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (form.nome.trim()) criar.mutate();
          }}
          className="mt-4 flex flex-col gap-2 rounded-lg border border-slate-200 p-4"
        >
          <input
            aria-label="Nome do fluxo"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            placeholder="Nome do fluxo"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <select
            aria-label="Gatilho"
            value={form.gatilhoTipo}
            onChange={(e) => setForm({ ...form, gatilhoTipo: e.target.value as GatilhoTipo })}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            {GATILHO_TIPOS.map((g) => (
              <option key={g} value={g}>
                {GATILHO_ROTULOS[g]}
              </option>
            ))}
          </select>
          {erro && <p className="text-sm text-brand-coral">{erro}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              className="w-fit rounded-md px-3 py-1.5 text-sm font-medium text-white"
              style={{ background: 'var(--color-brand-azul)' }}
            >
              Criar
            </button>
            <button
              type="button"
              onClick={() => setCriando(false)}
              className="w-fit rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {lista.isLoading && <p className="mt-6 text-sm text-slate-500">Carregando…</p>}
      {lista.isError && (
        <p className="mt-6 text-sm text-brand-coral">Não foi possível carregar os fluxos.</p>
      )}
      {lista.data && (
        <ul className="mt-4 divide-y divide-slate-100 rounded border border-slate-200">
          {lista.data.map((f) => (
            <li key={f.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <Link to={`/crm/workflow/${f.id}`} className="font-medium text-brand-azul">
                {f.nome}
              </Link>
              <span className="text-xs text-slate-400">
                {GATILHO_ROTULOS[(f.versaoPublicada ?? f.versaoRascunho)?.gatilhoTipo ?? 'LEAD_CRIADO']} ·{' '}
                {statusFluxo(f)}
              </span>
            </li>
          ))}
          {lista.data.length === 0 && (
            <li className="px-3 py-6 text-center text-slate-400">nenhum fluxo cadastrado</li>
          )}
        </ul>
      )}
    </section>
  );
}
