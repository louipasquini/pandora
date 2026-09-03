import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { usePodeUsar } from '../auth/usePermissoes';
import { pessoasApi } from './pessoas-api';
import { PessoaForm } from './PessoaForm';

/** Lista de pessoas (spec 005) — busca por nome / e-mail / telefone / documento. */
export function PessoasListPage() {
  const [q, setQ] = useState('');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [incluirUnificadas, setIncluir] = useState(false);
  const [criando, setCriando] = useState(false);
  const { pode: podeEditar } = usePodeUsar('pessoa:editar');

  const lista = useQuery({
    queryKey: ['pessoas', busca, pagina, incluirUnificadas],
    queryFn: () => pessoasApi.listar({ q: busca, pagina, incluirUnificadas }),
  });

  const totalPaginas = lista.data
    ? Math.max(1, Math.ceil(lista.data.total / lista.data.tamanho))
    : 1;

  return (
    <section className="max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Pessoas</h1>
          <p className="mt-1 text-sm text-slate-500">
            Identidade canônica do comprador — contatos, documentos e contas.
          </p>
        </div>
        {podeEditar && (
          <button
            type="button"
            onClick={() => setCriando(true)}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
            style={{ background: 'var(--color-brand-azul)' }}
          >
            Nova pessoa
          </button>
        )}
      </div>

      <form
        className="mt-6 flex flex-wrap items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setPagina(1);
          setBusca(q.trim());
        }}
      >
        <input
          aria-label="Buscar pessoas"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="nome, e-mail, telefone ou documento"
          className="w-72 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Buscar
        </button>
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={incluirUnificadas}
            onChange={(e) => {
              setPagina(1);
              setIncluir(e.target.checked);
            }}
          />
          incluir unificadas
        </label>
      </form>

      {lista.isLoading && <p className="mt-6 text-sm text-slate-500">Carregando…</p>}
      {lista.isError && (
        <p className="mt-6 text-sm text-brand-coral">
          Não foi possível carregar as pessoas.
        </p>
      )}

      {lista.data && (
        <>
          <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {lista.data.itens.length === 0 && (
              <li className="px-4 py-6 text-sm text-slate-500">Nenhuma pessoa encontrada.</li>
            )}
            {lista.data.itens.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <Link
                    to={`/pessoas/${p.id}`}
                    className="text-sm font-medium text-brand-azul hover:underline"
                  >
                    {p.nome}
                  </Link>
                  {p.unificada && (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">
                      unificada
                    </span>
                  )}
                  <p className="mt-0.5 text-xs text-slate-500">
                    {[p.emailPrimario, p.telefonePrimario, p.documentos[0]]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-center gap-3 text-sm text-slate-500">
            <button
              type="button"
              disabled={pagina <= 1}
              onClick={() => setPagina((n) => n - 1)}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
            >
              Anterior
            </button>
            <span>
              página {pagina} de {totalPaginas} · {lista.data.total} no total
            </span>
            <button
              type="button"
              disabled={pagina >= totalPaginas}
              onClick={() => setPagina((n) => n + 1)}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        </>
      )}

      {criando && (
        <PessoaForm
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
