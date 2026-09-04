import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { usePodeUsar } from '../auth/usePermissoes';
import { ESTAGIOS, leadsApi, type LeadView } from './leads-api';

/** Lista de leads (spec 008). Escopo de visão resolvido no backend. */
export function LeadsPage() {
  const [q, setQ] = useState('');
  const [busca, setBusca] = useState('');
  const [estagio, setEstagio] = useState('');
  const [status, setStatus] = useState('');
  const [origem, setOrigem] = useState('');
  const [pagina, setPagina] = useState(1);
  const [criando, setCriando] = useState(false);
  const { pode: podeCriar } = usePodeUsar('lead:criar');

  const lista = useQuery({
    queryKey: ['leads', busca, estagio, status, origem, pagina],
    queryFn: () =>
      leadsApi.listar({
        q: busca || undefined,
        estagio: estagio || undefined,
        status: status || undefined,
        origem: origem || undefined,
        pagina,
      }),
  });
  const totalPaginas = lista.data
    ? Math.max(1, Math.ceil(lista.data.total / lista.data.tamanho))
    : 1;

  return (
    <section className="max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">CRM · Leads</h1>
          <p className="mt-1 text-sm text-slate-500">
            Pré-compra. Entidade compartilhada com Marketing; o que você vê depende da sua permissão.
          </p>
        </div>
        {podeCriar && (
          <button
            type="button"
            onClick={() => setCriando(true)}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
            style={{ background: 'var(--color-brand-azul)' }}
          >
            Novo lead
          </button>
        )}
      </div>

      <form
        className="mt-6 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setPagina(1);
          setBusca(q.trim());
        }}
      >
        <input
          aria-label="Buscar leads"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="nome, e-mail ou telefone"
          className="w-64 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <label className="text-xs text-slate-500">
          Estágio
          <select
            aria-label="Filtrar por estágio"
            value={estagio}
            onChange={(e) => {
              setPagina(1);
              setEstagio(e.target.value);
            }}
            className="mt-0.5 block rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">todos</option>
            {ESTAGIOS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          Status
          <select
            aria-label="Filtrar por status"
            value={status}
            onChange={(e) => {
              setPagina(1);
              setStatus(e.target.value);
            }}
            className="mt-0.5 block rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">ativos</option>
            <option value="ATIVO">ATIVO</option>
            <option value="DESCARTADO">DESCARTADO</option>
            <option value="CONVERTIDO">CONVERTIDO</option>
          </select>
        </label>
        <input
          aria-label="Filtrar por origem"
          value={origem}
          onChange={(e) => {
            setPagina(1);
            setOrigem(e.target.value);
          }}
          placeholder="origem"
          className="w-36 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Buscar
        </button>
      </form>

      {criando && podeCriar && (
        <NovoLeadForm
          onClose={() => setCriando(false)}
          onCriou={() => {
            setCriando(false);
            void lista.refetch();
          }}
        />
      )}

      {lista.isLoading && <p className="mt-6 text-sm text-slate-500">Carregando…</p>}
      {lista.isError && (
        <p className="mt-6 text-sm text-brand-coral">Não foi possível carregar os leads.</p>
      )}

      {lista.data && (
        <>
          <table className="mt-4 w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2">Nome</th>
                <th>Contato</th>
                <th>Origem</th>
                <th>Estágio</th>
                <th>Status</th>
                <th className="text-right">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.data.itens.map((l: LeadView) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="py-2">
                    <Link to={`/crm/leads/${l.id}`} className="font-medium text-brand-azul">
                      {l.nome}
                    </Link>
                  </td>
                  <td className="text-slate-500">{l.email ?? l.telefone ?? '—'}</td>
                  <td className="text-slate-500">{l.origem ?? '—'}</td>
                  <td>{l.estagio}</td>
                  <td>{l.status}</td>
                  <td className="text-right font-semibold tabular-nums">{l.score}</td>
                </tr>
              ))}
              {lista.data.itens.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    nenhum lead
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {totalPaginas > 1 && (
            <div className="mt-4 flex items-center gap-2 text-sm">
              <button
                type="button"
                disabled={pagina <= 1}
                onClick={() => setPagina((p) => p - 1)}
                className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
              >
                anterior
              </button>
              <span className="text-slate-500">
                {pagina} / {totalPaginas}
              </span>
              <button
                type="button"
                disabled={pagina >= totalPaginas}
                onClick={() => setPagina((p) => p + 1)}
                className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
              >
                próxima
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function NovoLeadForm({ onClose, onCriou }: { onClose: () => void; onCriou: () => void }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [origem, setOrigem] = useState('manual');
  const [erro, setErro] = useState<string | null>(null);
  const [semelhantes, setSemelhantes] = useState<string[]>([]);

  const criar = useMutation({
    mutationFn: () => leadsApi.criar({ nome, email: email || undefined, telefone: telefone || undefined, origem }),
    onSuccess: (lead) => {
      setSemelhantes(lead.leadsSemelhantes ?? []);
      void qc.invalidateQueries({ queryKey: ['leads'] });
      if (!lead.leadsSemelhantes?.length) onCriou();
    },
    onError: (e: unknown) => setErro(e instanceof Error ? e.message : 'erro ao criar'),
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
        <input aria-label="Nome" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="nome" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        <input aria-label="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e-mail" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        <input aria-label="Telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="telefone" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        <input aria-label="Origem" value={origem} onChange={(e) => setOrigem(e.target.value)} placeholder="origem" className="w-32 rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        <button type="submit" className="rounded-md px-3 py-1.5 text-sm font-medium text-white" style={{ background: 'var(--color-brand-azul)' }}>
          Salvar
        </button>
        <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-slate-500">
          cancelar
        </button>
      </div>
      {erro && <p className="mt-2 text-sm text-brand-coral">{erro}</p>}
      {semelhantes.length > 0 && (
        <p className="mt-2 text-sm text-amber-700">
          Lead criado. Já existem {semelhantes.length} lead(s) com este contato — verifique duplicidade.{' '}
          <button type="button" className="underline" onClick={onCriou}>
            ok
          </button>
        </p>
      )}
    </form>
  );
}
