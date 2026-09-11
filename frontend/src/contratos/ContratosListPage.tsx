import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { STATUS_CONTRATO, contratosApi, formatarDict } from './contratos-api';

const STATUS_BADGE: Record<string, string> = {
  ATIVO: 'bg-emerald-100 text-emerald-700',
  EXPIRADO: 'bg-amber-100 text-amber-700',
  CANCELADO: 'bg-slate-100 text-slate-500',
  DESCONHECIDO: 'bg-amber-100 text-amber-800',
};

/**
 * Painel de Contratos do Financeiro (spec 025). 1 contrato por
 * `(pessoa, produto)`, perpétuo — o status é sempre derivado na leitura
 * (`fim_acesso` + tolerância + relógio), nunca um valor congelado. Só leitura
 * (a escrita é o pipeline de ingestão + o ajuste manual no detalhe).
 */
export function ContratosListPage() {
  const [produtoCodigo, setProdutoCodigo] = useState('');
  const [turma, setTurma] = useState('');
  const [pessoaId, setPessoaId] = useState('');
  const [status, setStatus] = useState('');
  const [pagina, setPagina] = useState(1);

  const queryKey = ['contratos', produtoCodigo, turma, pessoaId, status, pagina];
  const lista = useQuery({
    queryKey,
    queryFn: () =>
      contratosApi.listar({
        produtoCodigo: produtoCodigo || undefined,
        turma: turma || undefined,
        pessoaId: pessoaId || undefined,
        status: status || undefined,
        pagina,
      }),
  });

  const totalPaginas = lista.data
    ? Math.max(1, Math.ceil(lista.data.total / lista.data.tamanho))
    : 1;

  const resetPagina = () => setPagina(1);

  return (
    <section className="max-w-5xl">
      <h1 className="text-xl font-semibold text-slate-800">Contratos</h1>
      <p className="mt-1 text-sm text-slate-500">
        1 contrato por cliente e produto, perpétuo. O estado de acesso é sempre derivado —
        nunca um valor congelado no momento da última compra.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          aria-label="Produto (código)"
          value={produtoCodigo}
          onChange={(e) => setProdutoCodigo(e.target.value.toUpperCase())}
          onBlur={resetPagina}
          placeholder="código do produto"
          className="w-40 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <input
          aria-label="Turma"
          value={turma}
          onChange={(e) => setTurma(e.target.value)}
          onBlur={resetPagina}
          placeholder="turma"
          className="w-28 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <input
          aria-label="Pessoa (id)"
          value={pessoaId}
          onChange={(e) => setPessoaId(e.target.value)}
          onBlur={resetPagina}
          placeholder="id da pessoa"
          className="w-64 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <select
          aria-label="Status"
          value={status}
          onChange={(e) => {
            resetPagina();
            setStatus(e.target.value);
          }}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">qualquer status</option>
          {STATUS_CONTRATO.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {lista.isLoading && <p className="mt-6 text-sm text-slate-500">Carregando…</p>}
      {lista.isError && (
        <p className="mt-6 text-sm text-brand-coral">Não foi possível carregar os contratos.</p>
      )}

      {lista.data && (
        <>
          <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {lista.data.itens.length === 0 && (
              <li className="px-4 py-6 text-sm text-slate-500">Nenhum contrato encontrado.</li>
            )}
            {lista.data.itens.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <Link
                    to={`/contratos/${c.id}`}
                    className="text-sm font-medium text-brand-azul hover:underline"
                  >
                    {c.pessoa.nome} · {c.produto.codigo}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    fim de acesso:{' '}
                    {c.fimAcesso ? new Date(c.fimAcesso).toLocaleDateString() : 'sem aditivo válido'}
                    {' · recebido: '}
                    <span className="font-mono">{formatarDict(c.valorRecebido)}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {c.ajusteManualStatus && (
                    <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-sky-800">
                      ajuste manual
                    </span>
                  )}
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                      STATUS_BADGE[c.statusCanonico] ?? STATUS_BADGE.DESCONHECIDO
                    }`}
                  >
                    {c.statusCanonico}
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
