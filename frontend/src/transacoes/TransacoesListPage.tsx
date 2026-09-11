import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { usePodeUsar } from '../auth/usePermissoes';
import {
  CONTAS,
  STATUS_CANONICOS,
  formatarDinheiro,
  transacoesApi,
} from './transacoes-api';

/** Botão **Tentar vincular pendentes** (spec 024) — só com `transacao:vincular`. */
function TentarVincularPendentesButton({ onDone }: { onDone: () => void }) {
  const { pode } = usePodeUsar('transacao:vincular');
  const [mensagem, setMensagem] = useState<string | null>(null);
  const mutacao = useMutation({
    mutationFn: () => transacoesApi.tentarVincularPendentes(),
    onSuccess: (r) => {
      setMensagem(`${r.resolvidos} de ${r.tentativas} resolvidos`);
      onDone();
    },
    onError: () => setMensagem('não foi possível tentar os pendentes'),
  });

  if (!pode) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={mutacao.isPending}
        onClick={() => {
          setMensagem(null);
          mutacao.mutate();
        }}
        className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50"
      >
        {mutacao.isPending ? 'Tentando…' : 'Tentar vincular pendentes'}
      </button>
      {mensagem && <span className="text-xs text-slate-500">{mensagem}</span>}
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  PAGO: 'bg-emerald-100 text-emerald-700',
  PENDENTE: 'bg-slate-100 text-slate-600',
  EM_ATRASO: 'bg-amber-100 text-amber-700',
  RECUSADO: 'bg-red-100 text-red-700',
  CANCELADO: 'bg-slate-100 text-slate-500',
  ESTORNADO: 'bg-orange-100 text-orange-700',
  CHARGEBACK: 'bg-red-100 text-red-700',
  DESCONHECIDO: 'bg-amber-100 text-amber-800',
};

/**
 * Painel de transações do Financeiro (spec 018). Ledger consolidado das 7 contas
 * — 1 registro por venda, identidade `(plataforma_origem, id_origem)`. Só leitura
 * (a escrita é o pipeline de ingestão).
 */
export function TransacoesListPage() {
  const [conta, setConta] = useState('');
  const [status, setStatus] = useState('');
  const [pagoDeFato, setPagoDeFato] = useState(false);
  const [revisao, setRevisao] = useState(false);
  const [vinculoPendente, setVinculoPendente] = useState(false);
  const [q, setQ] = useState('');
  const [pagina, setPagina] = useState(1);
  const qc = useQueryClient();

  const queryKey = ['transacoes', conta, status, pagoDeFato, revisao, vinculoPendente, q, pagina];
  const lista = useQuery({
    queryKey,
    queryFn: () =>
      transacoesApi.listar({
        plataformaOrigem: conta || undefined,
        statusCanonico: status || undefined,
        pagoDeFato: pagoDeFato || undefined,
        precisaRevisao: revisao || undefined,
        vinculoPendente: vinculoPendente || undefined,
        q: q || undefined,
        pagina,
      }),
  });

  const totalPaginas = lista.data
    ? Math.max(1, Math.ceil(lista.data.total / lista.data.tamanho))
    : 1;

  const resetPagina = () => setPagina(1);

  return (
    <section className="max-w-5xl">
      <h1 className="text-xl font-semibold text-slate-800">Transações</h1>
      <p className="mt-1 text-sm text-slate-500">
        Ledger consolidado das 7 contas — sem duplicidade. Cada linha é uma venda de
        registro; os valores nunca somam moedas diferentes.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <select
          aria-label="Conta"
          value={conta}
          onChange={(e) => {
            resetPagina();
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
        <select
          aria-label="Status canônico"
          value={status}
          onChange={(e) => {
            resetPagina();
            setStatus(e.target.value);
          }}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">qualquer status</option>
          {STATUS_CANONICOS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          aria-label="Buscar por id de origem"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onBlur={resetPagina}
          placeholder="id de origem"
          className="w-48 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={pagoDeFato}
            onChange={(e) => {
              resetPagina();
              setPagoDeFato(e.target.checked);
            }}
          />
          pago de fato
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={revisao}
            onChange={(e) => {
              resetPagina();
              setRevisao(e.target.checked);
            }}
          />
          precisa revisão
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={vinculoPendente}
            onChange={(e) => {
              resetPagina();
              setVinculoPendente(e.target.checked);
            }}
          />
          pendente de vínculo
        </label>
        <TentarVincularPendentesButton onDone={() => qc.invalidateQueries({ queryKey })} />
      </div>

      {lista.isLoading && <p className="mt-6 text-sm text-slate-500">Carregando…</p>}
      {lista.isError && (
        <p className="mt-6 text-sm text-brand-coral">
          Não foi possível carregar as transações.
        </p>
      )}

      {lista.data && (
        <>
          <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {lista.data.itens.length === 0 && (
              <li className="px-4 py-6 text-sm text-slate-500">
                Nenhuma transação encontrada.
              </li>
            )}
            {lista.data.itens.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <Link
                    to={`/financeiro/transacoes/${t.id}`}
                    className="text-sm font-medium text-brand-azul hover:underline"
                  >
                    {t.plataformaOrigem} · {t.idOrigem}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {t.classificacao}
                    {t.ehAfiliada ? ' · afiliada' : ''}
                    {t.ocorridoEm
                      ? ` · ${new Date(t.ocorridoEm).toLocaleDateString()}`
                      : ' · sem data'}
                    {' · '}
                    <span className="font-mono">{formatarDinheiro(t.valorBruto)}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {t.precisaRevisao && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-800">
                      revisar
                    </span>
                  )}
                  {t.vinculoPendente && (
                    <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-sky-800">
                      vínculo pendente
                    </span>
                  )}
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                      STATUS_BADGE[t.statusCanonico] ?? STATUS_BADGE.PENDENTE
                    }`}
                  >
                    {t.statusCanonico}
                  </span>
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
