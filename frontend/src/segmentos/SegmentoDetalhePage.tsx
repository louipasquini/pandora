import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { usePodeUsar } from '../auth/usePermissoes';
import { mensagemErro, segmentosApi } from './segmentos-api';

/** Detalhe de um segmento (spec 009): filtro salvo + membros derivados na leitura. */
export function SegmentoDetalhePage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { pode: podeGerir } = usePodeUsar('segmento:gerir');
  const [erro, setErro] = useState<string | null>(null);

  const segmento = useQuery({ queryKey: ['segmento', id], queryFn: () => segmentosApi.obter(id) });
  const membros = useQuery({ queryKey: ['segmento-membros', id], queryFn: () => segmentosApi.membros(id) });

  const remover = useMutation({
    mutationFn: () => segmentosApi.remover(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['segmentos'] });
      navigate('/crm/segmentos');
    },
    onError: (e: unknown) => setErro(mensagemErro(e)),
  });

  if (segmento.isLoading) return <p className="p-6 text-sm text-slate-500">Carregando…</p>;
  if (segmento.isError || !segmento.data)
    return <p className="p-6 text-sm text-brand-coral">Segmento não encontrado.</p>;

  const s = segmento.data;

  return (
    <section className="max-w-3xl">
      <Link to="/crm/segmentos" className="text-sm text-brand-azul">
        ← Segmentos
      </Link>
      <div className="mt-2 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">{s.nome}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {s.alvo} {!s.ativo && '· inativo'} {s.descricao && `· ${s.descricao}`}
          </p>
        </div>
        {podeGerir && (
          <button
            type="button"
            onClick={() => remover.mutate()}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-brand-coral hover:bg-slate-50"
          >
            Excluir
          </button>
        )}
      </div>

      {erro && <p className="mt-3 text-sm text-brand-coral">{erro}</p>}

      <div className="mt-4">
        <h2 className="text-xs uppercase text-slate-400">Filtro</h2>
        <pre className="mt-1 overflow-x-auto rounded-md bg-slate-50 p-3 text-xs text-slate-600">
          {JSON.stringify(s.filtro, null, 2)}
        </pre>
      </div>

      <div className="mt-6">
        <h2 className="text-xs uppercase text-slate-400">
          Membros {membros.data && `(${membros.data.total})`}
        </h2>
        {membros.isLoading && <p className="mt-1 text-sm text-slate-500">Carregando…</p>}
        <ul className="mt-2 divide-y divide-slate-100 rounded border border-slate-200">
          {(membros.data?.itens ?? []).map((m) => {
            const item = m as { id: string; nome?: string };
            const to = s.alvo === 'LEAD' ? `/crm/leads/${item.id}` : `/pessoas/${item.id}`;
            return (
              <li key={item.id} className="px-3 py-2 text-sm">
                <Link to={to} className="text-brand-azul">
                  {item.nome ?? item.id}
                </Link>
              </li>
            );
          })}
          {membros.data && membros.data.itens.length === 0 && (
            <li className="px-3 py-6 text-center text-slate-400">nenhum membro no seu escopo</li>
          )}
        </ul>
      </div>
    </section>
  );
}
