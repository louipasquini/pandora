import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { usePodeUsar } from '../auth/usePermissoes';
import { mensagemErro, segmentosApi, type SegmentoAlvo } from './segmentos-api';

/** Lista de segmentos (spec 009, CL-03) — query salva declarativa. */
export function SegmentosPage() {
  const [criando, setCriando] = useState(false);
  const { pode: podeGerir } = usePodeUsar('segmento:gerir');
  const lista = useQuery({ queryKey: ['segmentos'], queryFn: () => segmentosApi.listar() });

  return (
    <section className="max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">CRM · Segmentos</h1>
          <p className="mt-1 text-sm text-slate-500">
            Query salva — os membros são sempre recalculados na leitura, nunca uma lista presa.
          </p>
        </div>
        {podeGerir && (
          <button
            type="button"
            onClick={() => setCriando(true)}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
            style={{ background: 'var(--color-brand-azul)' }}
          >
            Novo segmento
          </button>
        )}
      </div>

      {criando && podeGerir && (
        <NovoSegmentoForm
          onClose={() => setCriando(false)}
          onCriou={() => {
            setCriando(false);
            void lista.refetch();
          }}
        />
      )}

      {lista.isLoading && <p className="mt-6 text-sm text-slate-500">Carregando…</p>}
      {lista.isError && <p className="mt-6 text-sm text-brand-coral">Não foi possível carregar os segmentos.</p>}

      {lista.data && (
        <ul className="mt-4 divide-y divide-slate-100 rounded border border-slate-200">
          {lista.data.itens.map((s) => (
            <li key={s.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <Link to={`/crm/segmentos/${s.id}`} className="font-medium text-brand-azul">
                {s.nome}
              </Link>
              <span className="text-xs text-slate-400">
                {s.alvo} {!s.ativo && '· inativo'}
              </span>
            </li>
          ))}
          {lista.data.itens.length === 0 && (
            <li className="px-3 py-6 text-center text-slate-400">nenhum segmento</li>
          )}
        </ul>
      )}
    </section>
  );
}

function NovoSegmentoForm({ onClose, onCriou }: { onClose: () => void; onCriou: () => void }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState('');
  const [alvo, setAlvo] = useState<SegmentoAlvo>('LEAD');
  const [erro, setErro] = useState<string | null>(null);

  const criar = useMutation({
    mutationFn: () => segmentosApi.criar({ nome, alvo, filtro: {} }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['segmentos'] });
      onCriou();
    },
    onError: (e: unknown) => setErro(mensagemErro(e)),
  });

  return (
    <form
      className="mt-4 rounded-lg border border-slate-200 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        criar.mutate();
      }}
    >
      <div className="flex flex-wrap gap-3">
        <input
          aria-label="Nome do segmento"
          required
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="nome"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <select
          aria-label="Alvo"
          value={alvo}
          onChange={(e) => setAlvo(e.target.value as SegmentoAlvo)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="LEAD">Lead</option>
          <option value="PESSOA">Pessoa</option>
        </select>
        <button
          type="submit"
          className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
          style={{ background: 'var(--color-brand-azul)' }}
        >
          Salvar
        </button>
        <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-slate-500">
          cancelar
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Filtro inicial vazio (traz tudo dentro do seu escopo) — refine editando o segmento.
      </p>
      {erro && <p className="mt-2 text-sm text-brand-coral">{erro}</p>}
    </form>
  );
}
