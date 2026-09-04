import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { usePodeUsar } from '../auth/usePermissoes';
import { TagPicker } from '../interacoes/TagPicker';
import { TimelineInteracoes } from '../interacoes/TimelineInteracoes';
import { tagsApi } from '../interacoes/interacoes-api';
import { mensagemErro, pessoasApi, type Contato } from './pessoas-api';
import { MergeDialog } from './MergeDialog';

function ContatoLinha({ c }: { c: Contato }) {
  return (
    <li className="flex items-center gap-2 py-1 text-sm">
      <span className={c.primario ? 'font-medium text-slate-800' : 'text-slate-600'}>
        {c.valor}
      </span>
      {c.primario && (
        <span className="rounded bg-brand-menta/20 px-1.5 py-0.5 text-[10px] uppercase text-slate-600">
          primário
        </span>
      )}
      {c.curado && (
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase text-amber-700">
          curado
        </span>
      )}
      {!c.primario && c.rebaixadoEm && (
        <span className="text-[11px] text-slate-400">
          secundário desde {new Date(c.rebaixadoEm).toLocaleDateString('pt-BR')}
        </span>
      )}
    </li>
  );
}

/** Detalhe de uma pessoa (spec 005 + 009: tags e timeline unificada). */
export function PessoaDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const [mergeAberto, setMergeAberto] = useState(false);
  const { pode: podeMerge } = usePodeUsar('pessoa:merge');
  const { pode: podePessoaEditar } = usePodeUsar('pessoa:editar');
  const { pode: podeInteracaoRegistrar } = usePodeUsar('interacao:registrar');
  const { pode: podeInteracaoGerir } = usePodeUsar('interacao:gerir');

  const pessoa = useQuery({
    queryKey: ['pessoa', id],
    queryFn: () => pessoasApi.detalhe(id),
  });
  const tags = useQuery({
    queryKey: ['pessoa-tags', id],
    queryFn: () => tagsApi.listarDe({ tipo: 'pessoa', id }),
  });

  const desfazer = useMutation({
    mutationFn: (mergeId: string) => pessoasApi.desfazerMerge(pessoa.data!.id, mergeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pessoa'] }),
  });

  if (pessoa.isLoading) return <p className="text-sm text-slate-500">Carregando…</p>;
  if (pessoa.isError)
    return <p className="text-sm text-brand-coral">{mensagemErro(pessoa.error)}</p>;

  const p = pessoa.data!;

  return (
    <section className="max-w-3xl">
      {p.unificacao && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800"
        >
          Esta pessoa foi unificada. Você está vendo os dados da pessoa sobrevivente.
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">{p.nome}</h1>
          <p className="mt-1 text-xs text-slate-500">
            {p.tipo} · <span className="font-mono">{p.id}</span>
          </p>
        </div>
        {podeMerge && (
          <button
            type="button"
            onClick={() => setMergeAberto(true)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Unificar
          </button>
        )}
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">E-mails</h2>
          <ul>
            {p.emails.length === 0 && <li className="text-sm text-slate-400">—</li>}
            {p.emails.map((c) => (
              <ContatoLinha key={c.valor} c={c} />
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Telefones</h2>
          <ul>
            {p.telefones.length === 0 && <li className="text-sm text-slate-400">—</li>}
            {p.telefones.map((c) => (
              <ContatoLinha key={c.valor} c={c} />
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Documentos</h2>
          <ul className="text-sm text-slate-600">
            {p.documentos.length === 0 && <li className="text-slate-400">—</li>}
            {p.documentos.map((d) => (
              <li key={d.valor}>
                {d.tipo} {d.valor}
                {d.curado && <span className="ml-1 text-[10px] uppercase text-amber-700">curado</span>}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Conta</h2>
          {p.conta ? (
            <Link
              to={`/contas/${p.conta.id}`}
              className="text-sm text-brand-azul hover:underline"
            >
              {p.conta.nome} ({p.conta.tipo})
            </Link>
          ) : (
            <p className="text-sm text-slate-400">sem conta</p>
          )}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-slate-700">Origem</h2>
        <ul className="mt-1 text-xs text-slate-500">
          {p.origemRefs.length === 0 && <li className="text-slate-400">—</li>}
          {p.origemRefs.map((r) => (
            <li key={`${r.plataformaOrigem}-${r.tipoRef}-${r.valorRef}`}>
              {r.plataformaOrigem} · {r.tipoRef} = <span className="font-mono">{r.valorRef}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-slate-700">Unificações</h2>
        <ul className="mt-1 divide-y divide-slate-100 rounded border border-slate-200">
          {p.merges.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-400">nenhuma</li>
          )}
          {p.merges.map((m) => (
            <li key={m.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="text-slate-600">
                {m.papel === 'sobrevivente' ? 'absorveu' : 'foi absorvida por'}{' '}
                <span className="font-mono text-xs">{m.absorvidaId}</span> ·{' '}
                {new Date(m.quando).toLocaleString('pt-BR')} ·{' '}
                <span className={m.estado === 'ativo' ? '' : 'text-slate-400'}>{m.estado}</span>
              </span>
              {podeMerge && m.papel === 'sobrevivente' && m.estado === 'ativo' && (
                <button
                  type="button"
                  onClick={() => desfazer.mutate(m.id)}
                  disabled={desfazer.isPending}
                  className="text-xs text-brand-azul hover:underline disabled:opacity-50"
                >
                  Desfazer
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-slate-700">Tags</h2>
        <div className="mt-1">
          <TagPicker
            ancora={{ tipo: 'pessoa', id }}
            tags={tags.data?.tags ?? []}
            podeEditar={podePessoaEditar}
            onChange={() => void qc.invalidateQueries({ queryKey: ['pessoa-tags', id] })}
          />
        </div>
      </div>

      <div className="mt-6">
        <TimelineInteracoes
          ancora={{ pessoaId: id }}
          podeRegistrar={podeInteracaoRegistrar}
          podeGerir={podeInteracaoGerir}
        />
      </div>

      {mergeAberto && (
        <MergeDialog
          sobreviventeId={p.id}
          onFechar={() => setMergeAberto(false)}
          onUnificada={() => {
            setMergeAberto(false);
            void qc.invalidateQueries({ queryKey: ['pessoa', id] });
          }}
        />
      )}
    </section>
  );
}
