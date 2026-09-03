import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { usePodeUsar } from '../auth/usePermissoes';
import { contasApi } from './contas-api';

function mensagemErro(err: unknown): string {
  const body = (err as { body?: unknown })?.body;
  if (body && typeof body === 'object' && 'message' in body) {
    const m = (body as { message: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return 'não foi possível concluir a ação';
}

/** Detalhe de uma conta — membros e unificações (spec 005). */
export function ContaDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const [pessoaId, setPessoaId] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const { pode: podeEditar } = usePodeUsar('conta:editar');
  const { pode: podeMerge } = usePodeUsar('conta:merge');

  const conta = useQuery({
    queryKey: ['conta', id],
    queryFn: () => contasApi.detalhe(id),
  });

  const invalidar = () => qc.invalidateQueries({ queryKey: ['conta', id] });

  const associar = useMutation({
    mutationFn: () => contasApi.associar(id, pessoaId.trim()),
    onSuccess: () => {
      setPessoaId('');
      setErro(null);
      void invalidar();
    },
    onError: (e) => setErro(mensagemErro(e)),
  });
  const desassociar = useMutation({
    mutationFn: (pid: string) => contasApi.desassociar(id, pid),
    onSuccess: () => invalidar(),
  });
  const desfazer = useMutation({
    mutationFn: (mergeId: string) => contasApi.desfazerMerge(id, mergeId),
    onSuccess: () => invalidar(),
  });

  if (conta.isLoading) return <p className="text-sm text-slate-500">Carregando…</p>;
  if (conta.isError)
    return <p className="text-sm text-brand-coral">{mensagemErro(conta.error)}</p>;

  const c = conta.data!;

  return (
    <section className="max-w-2xl">
      {c.unificacao && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800"
        >
          Esta conta foi unificada. Você está vendo a conta sobrevivente.
        </div>
      )}
      <h1 className="text-xl font-semibold text-slate-800">{c.nome}</h1>
      <p className="mt-1 text-xs text-slate-500">
        {c.tipo} · <span className="font-mono">{c.id}</span>
      </p>

      <h2 className="mt-6 text-sm font-semibold text-slate-700">Membros</h2>
      <ul className="mt-1 divide-y divide-slate-100 rounded border border-slate-200">
        {c.pessoas.length === 0 && (
          <li className="px-3 py-2 text-sm text-slate-400">nenhuma pessoa</li>
        )}
        {c.pessoas.map((p) => (
          <li key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
            <Link to={`/pessoas/${p.id}`} className="text-brand-azul hover:underline">
              {p.nome}
            </Link>
            {podeEditar && (
              <button
                type="button"
                onClick={() => desassociar.mutate(p.id)}
                className="text-xs text-slate-500 hover:text-brand-coral"
              >
                remover
              </button>
            )}
          </li>
        ))}
      </ul>

      {podeEditar && (
        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            associar.mutate();
          }}
        >
          <input
            aria-label="Id da pessoa a associar"
            value={pessoaId}
            onChange={(e) => setPessoaId(e.target.value)}
            placeholder="id da pessoa"
            className="w-72 rounded-md border border-slate-300 px-3 py-1.5 font-mono text-xs"
          />
          <button
            type="submit"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Associar
          </button>
        </form>
      )}
      {erro && <p className="mt-2 text-sm text-brand-coral">{erro}</p>}

      <h2 className="mt-6 text-sm font-semibold text-slate-700">Unificações</h2>
      <ul className="mt-1 divide-y divide-slate-100 rounded border border-slate-200">
        {c.merges.length === 0 && (
          <li className="px-3 py-2 text-sm text-slate-400">nenhuma</li>
        )}
        {c.merges.map((m) => (
          <li key={m.id} className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="text-slate-600">
              {m.papel === 'sobrevivente' ? 'absorveu' : 'foi absorvida por'}{' '}
              <span className="font-mono text-xs">{m.absorvidaId}</span> · {m.estado}
            </span>
            {podeMerge && m.papel === 'sobrevivente' && m.estado === 'ativo' && (
              <button
                type="button"
                onClick={() => desfazer.mutate(m.id)}
                className="text-xs text-brand-azul hover:underline"
              >
                Desfazer
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
