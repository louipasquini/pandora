import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { CONTAS, eventosApi } from './eventos-api';

const STATUS_BADGE: Record<string, string> = {
  ok: 'bg-emerald-100 text-emerald-700',
  erro: 'bg-red-100 text-red-700',
  revisar: 'bg-amber-100 text-amber-700',
  pendente: 'bg-slate-100 text-slate-600',
};

/**
 * Painel de eventos de ingestão (spec 006). _Default_: só `revisar` + `erro` — o
 * motivo do painel existir. Filtros por conta / status / tipo; paginação.
 */
export function EventosListPage() {
  const [conta, setConta] = useState('');
  const [tipo, setTipo] = useState('');
  const [tudo, setTudo] = useState(false);
  const [pagina, setPagina] = useState(1);

  const lista = useQuery({
    queryKey: ['eventos', conta, tipo, tudo, pagina],
    queryFn: () =>
      eventosApi.listar({
        status: tudo ? 'todos' : 'revisar,erro',
        plataformaOrigem: conta || undefined,
        tipoOrigem: tipo || undefined,
        pagina,
      }),
  });

  const totalPaginas = lista.data
    ? Math.max(1, Math.ceil(lista.data.total / lista.data.tamanho))
    : 1;

  return (
    <section className="max-w-4xl">
      <h1 className="text-xl font-semibold text-slate-800">Eventos de ingestão</h1>
      <p className="mt-1 text-sm text-slate-500">
        Log imutável do que chega das 7 contas de origem. Aqui ficam os que precisam de
        atenção.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <select
          aria-label="Conta"
          value={conta}
          onChange={(e) => {
            setPagina(1);
            setConta(e.target.value);
          }}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">todas as contas</option>
          {CONTAS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          aria-label="Tipo de origem"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          onBlur={() => setPagina(1)}
          placeholder="tipo (ex.: webhook_venda)"
          className="w-56 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={tudo}
            onChange={(e) => {
              setPagina(1);
              setTudo(e.target.checked);
            }}
          />
          mostrar todos os status
        </label>
      </div>

      {lista.isLoading && <p className="mt-6 text-sm text-slate-500">Carregando…</p>}
      {lista.isError && (
        <p className="mt-6 text-sm text-brand-coral">Não foi possível carregar os eventos.</p>
      )}

      {lista.data && (
        <>
          <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {lista.data.itens.length === 0 && (
              <li className="px-4 py-6 text-sm text-slate-500">
                Nenhum evento {tudo ? '' : 'em revisão ou com erro '}encontrado.
              </li>
            )}
            {lista.data.itens.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <Link
                    to={`/eventos/${e.id}`}
                    className="text-sm font-medium text-brand-azul hover:underline"
                  >
                    {e.plataformaOrigem} · {e.tipoOrigem}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {e.idOrigem}
                    {e.classificacao ? ` · ${e.classificacao}` : ''}
                    {e.erroDetalhe ? ` · ${e.erroDetalhe}` : ''}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                    STATUS_BADGE[e.status] ?? STATUS_BADGE.pendente
                  }`}
                >
                  {e.status}
                </span>
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
    </section>
  );
}
