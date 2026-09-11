import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { usePodeUsar } from '../auth/usePermissoes';
import { ofertasApi } from '../ofertas/ofertas-api';
import { produtosApi } from './produtos-api';

/** Curadoria de um produto (spec 023) + lista das ofertas ligadas a ele. */
export function ProdutoDetailPage() {
  const { codigo = '' } = useParams();
  const qc = useQueryClient();
  const { pode: podeEditar } = usePodeUsar('produto:editar');

  const produto = useQuery({
    queryKey: ['produto', codigo],
    queryFn: () => produtosApi.buscar(codigo),
  });
  const ofertas = useQuery({
    queryKey: ['ofertas', 'produtoCodigo', codigo],
    queryFn: () => ofertasApi.listar({ produtoCodigo: codigo }),
    enabled: !!produto.data,
  });

  const [nome, setNome] = useState('');
  const [assinatura, setAssinatura] = useState<'sim' | 'nao' | ''>('');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!produto.data) return;
    setNome(produto.data.nome ?? '');
    setAssinatura(produto.data.assinatura == null ? '' : produto.data.assinatura ? 'sim' : 'nao');
  }, [produto.data]);

  const curar = useMutation({
    mutationFn: () =>
      produtosApi.curar(codigo, {
        nome: nome.trim() || undefined,
        assinatura: assinatura === '' ? undefined : assinatura === 'sim',
      }),
    onSuccess: async (novo) => {
      setErro(null);
      qc.setQueryData(['produto', codigo], novo);
    },
    onError: () => setErro('Não foi possível salvar. Confira os dados e tente de novo.'),
  });

  if (produto.isLoading) return <p className="p-6 text-sm text-slate-500">Carregando…</p>;
  if (produto.isError || !produto.data)
    return (
      <section className="max-w-2xl p-6">
        <p className="text-sm text-brand-coral">Produto não encontrado.</p>
        <Link to="/produtos" className="mt-4 inline-block text-sm text-brand-azul hover:underline">
          ← voltar
        </Link>
      </section>
    );

  const p = produto.data;

  return (
    <section className="max-w-2xl">
      <Link to="/produtos" className="text-sm text-brand-azul hover:underline">
        ← Produtos
      </Link>

      <h1 className="mt-3 text-lg font-semibold text-slate-800">
        {p.codigo} <span className="text-slate-400">·</span> {p.nome ?? 'sem nome curado'}
      </h1>

      {podeEditar && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            curar.mutate();
          }}
          className="mt-5 space-y-3 rounded-lg border border-slate-200 p-4"
        >
          <h2 className="text-sm font-medium text-slate-700">Curadoria</h2>
          <label className="block text-sm">
            <span className="text-slate-500">Nome</span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-500">Assinatura?</span>
            <select
              value={assinatura}
              onChange={(e) => setAssinatura(e.target.value as 'sim' | 'nao' | '')}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5"
            >
              <option value="">não definido</option>
              <option value="sim">sim</option>
              <option value="nao">não</option>
            </select>
          </label>
          {erro && <p className="text-sm text-brand-coral">{erro}</p>}
          <button
            type="submit"
            disabled={curar.isPending}
            className="rounded-md bg-brand-azul px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Salvar
          </button>
        </form>
      )}

      <div className="mt-6">
        <h2 className="text-sm font-medium text-slate-700">Ofertas deste produto</h2>
        <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {(ofertas.data?.itens.length ?? 0) === 0 && (
            <li className="px-4 py-4 text-sm text-slate-500">Nenhuma oferta ainda.</li>
          )}
          {ofertas.data?.itens.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <Link to={`/ofertas/${o.id}`} className="text-sm text-brand-azul hover:underline">
                {o.turma.tipo === 'NUMERO'
                  ? `Turma ${o.turma.numero}`
                  : o.turma.tipo ?? 'turma não identificada'}
              </Link>
              <span className="text-xs text-slate-500">
                {o.origensRef.map((r) => `${r.plataformaOrigem}/${r.tipoRef}`).join(', ')}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
