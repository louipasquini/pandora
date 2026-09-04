import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { usePodeUsar } from '../auth/usePermissoes';
import { ESTAGIOS, leadsApi } from './leads-api';

/** Detalhe de um lead (spec 008): contato, score, tags, campos personalizados, auditoria. */
export function LeadDetalhePage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const { pode: podeEditar } = usePodeUsar('lead:editar');
  const { pode: podePessoa } = usePodeUsar('pessoa:editar');
  const [erro, setErro] = useState<string | null>(null);
  const [novaTag, setNovaTag] = useState('');

  const lead = useQuery({ queryKey: ['lead', id], queryFn: () => leadsApi.obter(id) });
  const auditoria = useQuery({
    queryKey: ['lead-auditoria', id],
    queryFn: () => leadsApi.auditoria(id),
  });
  const defs = useQuery({ queryKey: ['campos-lead-defs'], queryFn: () => leadsApi.listarDefs() });

  const refetch = () => {
    void qc.invalidateQueries({ queryKey: ['lead', id] });
    void qc.invalidateQueries({ queryKey: ['lead-auditoria', id] });
  };
  const semErro = <T,>(p: Promise<T>) =>
    p.catch((e: unknown) => setErro(e instanceof Error ? e.message : 'erro'));

  const mudarEstagio = useMutation({
    mutationFn: (estagio: string) => leadsApi.patch(id, { estagio }),
    onSuccess: refetch,
    onError: (e: unknown) => setErro(e instanceof Error ? e.message : 'erro'),
  });
  const converter = useMutation({
    mutationFn: () => leadsApi.converter(id),
    onSuccess: refetch,
    onError: (e: unknown) => setErro(e instanceof Error ? e.message : 'erro ao converter'),
  });

  if (lead.isLoading) return <p className="p-6 text-sm text-slate-500">Carregando…</p>;
  if (lead.isError || !lead.data)
    return <p className="p-6 text-sm text-brand-coral">Lead não encontrado.</p>;

  const l = lead.data;
  const podeConverter = podeEditar && podePessoa && l.status === 'ATIVO';

  return (
    <section className="max-w-3xl">
      <Link to="/crm/leads" className="text-sm text-brand-azul">
        ← Leads
      </Link>
      <div className="mt-2 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">{l.nome}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {l.email ?? '—'} · {l.telefone ?? '—'} · origem {l.origem ?? '—'}
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold tabular-nums text-brand-azul">{l.score}</div>
          <div className="text-xs text-slate-400">score</div>
          {podeEditar && (
            <button
              type="button"
              onClick={() => void semErro(leadsApi.recalcularScore(id).then(refetch))}
              className="mt-1 text-xs text-slate-500 underline"
            >
              recalcular
            </button>
          )}
        </div>
      </div>

      {erro && <p className="mt-3 text-sm text-brand-coral">{erro}</p>}

      <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs uppercase text-slate-400">Estágio</dt>
          <dd>
            {podeEditar ? (
              <select
                aria-label="Estágio"
                value={l.estagio}
                onChange={(e) => mudarEstagio.mutate(e.target.value)}
                className="mt-0.5 rounded-md border border-slate-300 px-2 py-1"
              >
                {ESTAGIOS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            ) : (
              l.estagio
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-slate-400">Status</dt>
          <dd>{l.status}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-slate-400">UTM</dt>
          <dd className="text-slate-500">
            {l.utm.source ?? '—'} / {l.utm.campaign ?? '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-slate-400">Pessoa vinculada</dt>
          <dd>
            {l.pessoaId ? (
              <Link to={`/pessoas/${l.pessoaId}`} className="text-brand-azul">
                ver pessoa
              </Link>
            ) : (
              '—'
            )}
          </dd>
        </div>
      </dl>

      {/* tags */}
      <div className="mt-6">
        <h2 className="text-xs uppercase text-slate-400">Tags</h2>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {l.tags.map((t) => (
            <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
              {t}
              {podeEditar && (
                <button
                  type="button"
                  aria-label={`remover ${t}`}
                  onClick={() => void semErro(leadsApi.removerTag(id, t).then(refetch))}
                  className="ml-1 text-slate-400"
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {podeEditar && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (novaTag.trim()) {
                  void semErro(leadsApi.addTag(id, novaTag.trim()).then(refetch));
                  setNovaTag('');
                }
              }}
            >
              <input
                aria-label="Nova tag"
                value={novaTag}
                onChange={(e) => setNovaTag(e.target.value)}
                placeholder="+ tag"
                className="w-24 rounded-md border border-slate-300 px-2 py-0.5 text-xs"
              />
            </form>
          )}
        </div>
      </div>

      {/* campos personalizados */}
      {defs.data && defs.data.length > 0 && (
        <CamposPersonalizados
          leadId={id}
          defs={defs.data}
          atuais={l.campos ?? {}}
          podeEditar={podeEditar}
          onSalvou={refetch}
        />
      )}

      {/* converter */}
      <div className="mt-6">
        {podeConverter && (
          <button
            type="button"
            onClick={() => converter.mutate()}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
            style={{ background: 'var(--color-brand-menta)' }}
          >
            Converter em pessoa
          </button>
        )}
        {l.status === 'CONVERTIDO' && (
          <p className="text-sm text-slate-500">Convertido — este lead virou uma pessoa.</p>
        )}
      </div>

      {/* auditoria */}
      <div className="mt-8">
        <h2 className="text-xs uppercase text-slate-400">Histórico</h2>
        <ul className="mt-2 space-y-1 text-sm text-slate-600">
          {(auditoria.data?.itens ?? []).map((a) => (
            <li key={a.id}>
              <span className="text-slate-400">{new Date(a.quando).toLocaleString()}</span> ·{' '}
              <span className="font-medium">{a.motivo}</span> {a.campo}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function CamposPersonalizados({
  leadId,
  defs,
  atuais,
  podeEditar,
  onSalvou,
}: {
  leadId: string;
  defs: { chave: string; rotulo: string; tipo: string; opcoes: string[]; obrigatorio: boolean; ativo: boolean }[];
  atuais: Record<string, string>;
  podeEditar: boolean;
  onSalvou: () => void;
}) {
  const [valores, setValores] = useState<Record<string, string>>(atuais);
  const [erro, setErro] = useState<string | null>(null);
  const salvar = useMutation({
    mutationFn: () => leadsApi.putCampos(leadId, valores),
    onSuccess: onSalvou,
    onError: (e: unknown) => setErro(e instanceof Error ? e.message : 'erro'),
  });
  const ativas = defs.filter((d) => d.ativo);

  return (
    <form
      className="mt-6"
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        salvar.mutate();
      }}
    >
      <h2 className="text-xs uppercase text-slate-400">Campos personalizados</h2>
      <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
        {ativas.map((d) => (
          <label key={d.chave} className="text-xs text-slate-500">
            {d.rotulo}
            {d.tipo === 'SELECAO' ? (
              <select
                aria-label={d.rotulo}
                disabled={!podeEditar}
                value={valores[d.chave] ?? ''}
                onChange={(e) => setValores((v) => ({ ...v, [d.chave]: e.target.value }))}
                className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1"
              >
                <option value="">—</option>
                {d.opcoes.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                aria-label={d.rotulo}
                disabled={!podeEditar}
                value={valores[d.chave] ?? ''}
                onChange={(e) => setValores((v) => ({ ...v, [d.chave]: e.target.value }))}
                className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1"
              />
            )}
          </label>
        ))}
      </div>
      {erro && <p className="mt-2 text-sm text-brand-coral">{erro}</p>}
      {podeEditar && (
        <button
          type="submit"
          className="mt-2 rounded-md border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Salvar campos
        </button>
      )}
    </form>
  );
}
