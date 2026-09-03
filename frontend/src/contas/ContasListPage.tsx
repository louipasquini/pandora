import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { usePodeUsar } from '../auth/usePermissoes';
import { contasApi } from './contas-api';
import { ContaForm } from './ContaForm';

/** Lista de contas (household / empresa) — spec 005. */
export function ContasListPage() {
  const [q, setQ] = useState('');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [criando, setCriando] = useState(false);
  const { pode: podeEditar } = usePodeUsar('conta:editar');

  const lista = useQuery({
    queryKey: ['contas', busca, pagina],
    queryFn: () => contasApi.listar({ q: busca, pagina }),
  });

  return (
    <section className="max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Contas</h1>
          <p className="mt-1 text-sm text-slate-500">
            Agrupamento household / empresa de pessoas.
          </p>
        </div>
        {podeEditar && (
          <button
            type="button"
            onClick={() => setCriando(true)}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
            style={{ background: 'var(--color-brand-azul)' }}
          >
            Nova conta
          </button>
        )}
      </div>

      <form
        className="mt-6 flex items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setPagina(1);
          setBusca(q.trim());
        }}
      >
        <input
          aria-label="Buscar contas"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="nome da conta"
          className="w-64 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Buscar
        </button>
      </form>

      {lista.isLoading && <p className="mt-6 text-sm text-slate-500">Carregando…</p>}
      {lista.isError && (
        <p className="mt-6 text-sm text-brand-coral">Não foi possível carregar as contas.</p>
      )}

      {lista.data && (
        <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {lista.data.itens.length === 0 && (
            <li className="px-4 py-6 text-sm text-slate-500">Nenhuma conta encontrada.</li>
          )}
          {lista.data.itens.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <Link
                  to={`/contas/${c.id}`}
                  className="text-sm font-medium text-brand-azul hover:underline"
                >
                  {c.nome}
                </Link>
                <p className="mt-0.5 text-xs text-slate-500">
                  {c.tipo} · {c.totalPessoas} pessoa(s)
                </p>
              </div>
              {c.unificada && (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">
                  unificada
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {criando && (
        <ContaForm
          onFechar={() => setCriando(false)}
          onCriada={() => {
            setCriando(false);
            void lista.refetch();
          }}
        />
      )}
    </section>
  );
}
