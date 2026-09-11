import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { produtosApi } from './produtos-api';

/**
 * Catálogo · Produtos (spec 023). `produto` é o "o que se vende" — auto-criado
 * na 1ª venda com um código novo (3 letras); nome/assinatura são curadoria.
 */
export function ProdutosListPage() {
  const [q, setQ] = useState('');
  const [pagina, setPagina] = useState(1);

  const lista = useQuery({
    queryKey: ['produtos', q, pagina],
    queryFn: () => produtosApi.listar({ q: q || undefined, pagina }),
  });

  const totalPaginas = lista.data
    ? Math.max(1, Math.ceil(lista.data.total / lista.data.tamanho))
    : 1;

  return (
    <section className="max-w-3xl">
      <h1 className="text-xl font-semibold text-slate-800">Produtos</h1>
      <p className="mt-1 text-sm text-slate-500">
        Produtos do catálogo — auto-criados na 1ª venda com um código novo (3 letras).
        Nome e assinatura são curadoria manual.
      </p>

      <div className="mt-6">
        <input
          aria-label="Buscar por código ou nome"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onBlur={() => setPagina(1)}
          placeholder="código ou nome"
          className="w-64 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
      </div>

      {lista.isLoading && <p className="mt-6 text-sm text-slate-500">Carregando…</p>}
      {lista.isError && (
        <p className="mt-6 text-sm text-brand-coral">Não foi possível carregar os produtos.</p>
      )}

      {lista.data && (
        <>
          <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {lista.data.itens.length === 0 && (
              <li className="px-4 py-6 text-sm text-slate-500">Nenhum produto encontrado.</li>
            )}
            {lista.data.itens.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <Link
                    to={`/produtos/${p.codigo}`}
                    className="text-sm font-medium text-brand-azul hover:underline"
                  >
                    {p.codigo}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {p.nome ?? 'sem nome curado'}
                    {p.assinatura != null ? ` · ${p.assinatura ? 'assinatura' : 'avulso'}` : ''}
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
    </section>
  );
}
