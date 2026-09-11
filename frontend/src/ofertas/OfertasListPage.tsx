import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { formatarDinheiro, ofertasApi, rotuloTurma } from './ofertas-api';

const CONTAS = [
  'TMB',
  'ASAAS_PRD',
  'ASAAS_SVC',
  'GURU_PRD',
  'GURU_SVC',
  'HOTMART_PRD',
  'HOTMART_SVC',
] as const;

/**
 * Catálogo · Ofertas (spec 023). `oferta` é "a forma de vender" um produto —
 * resolvida por `(tag AEN, plataforma)`; a mesma oferta comercial em 2
 * plataformas vira 2 registros. Import do catálogo Hotmart em aba própria.
 */
export function OfertasListPage() {
  const [produtoCodigo, setProdutoCodigo] = useState('');
  const [plataforma, setPlataforma] = useState('');
  const [pagina, setPagina] = useState(1);

  const lista = useQuery({
    queryKey: ['ofertas', produtoCodigo, plataforma, pagina],
    queryFn: () =>
      ofertasApi.listar({
        produtoCodigo: produtoCodigo || undefined,
        plataformaOrigem: plataforma || undefined,
        pagina,
      }),
  });

  const totalPaginas = lista.data
    ? Math.max(1, Math.ceil(lista.data.total / lista.data.tamanho))
    : 1;

  return (
    <section className="max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">Ofertas</h1>
        <Link
          to="/ofertas/importar-hotmart"
          className="text-sm text-brand-azul hover:underline"
        >
          Importar catálogo Hotmart →
        </Link>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Formas de vender um produto — a mesma oferta comercial vendida em 2 plataformas vira
        2 registros que compartilham a tag AEN.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          aria-label="Código do produto"
          value={produtoCodigo}
          onChange={(e) => {
            setPagina(1);
            setProdutoCodigo(e.target.value.toUpperCase());
          }}
          placeholder="código do produto"
          className="w-40 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <select
          aria-label="Plataforma"
          value={plataforma}
          onChange={(e) => {
            setPagina(1);
            setPlataforma(e.target.value);
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
      </div>

      {lista.isLoading && <p className="mt-6 text-sm text-slate-500">Carregando…</p>}
      {lista.isError && (
        <p className="mt-6 text-sm text-brand-coral">Não foi possível carregar as ofertas.</p>
      )}

      {lista.data && (
        <>
          <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {lista.data.itens.length === 0 && (
              <li className="px-4 py-6 text-sm text-slate-500">Nenhuma oferta encontrada.</li>
            )}
            {lista.data.itens.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <Link
                    to={`/ofertas/${o.id}`}
                    className="text-sm font-medium text-brand-azul hover:underline"
                  >
                    {o.produto.codigo} · {rotuloTurma(o.turma)}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {o.origensRef.map((r) => `${r.plataformaOrigem}/${r.tipoRef}`).join(', ') ||
                      'sem alias de origem'}
                    {o.catalogo?.ticket ? ` · ${formatarDinheiro(o.catalogo.ticket)}` : ''}
                  </p>
                </div>
                {!o.catalogo && (
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500">
                    sem catálogo
                  </span>
                )}
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
