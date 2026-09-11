import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { usePodeUsar } from '../auth/usePermissoes';
import {
  ROTULO_LABEL,
  STATUS_CONTRATO,
  contratosApi,
  formatarDict,
  formatarDinheiro,
} from './contratos-api';

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-slate-500">{rotulo}</span>
      <span className="text-right text-slate-800">{valor ?? '—'}</span>
    </div>
  );
}

/** Formulário de ajuste manual (`PATCH /contratos/:id`) — só com `contrato:editar`. */
function AjusteManualForm({ contratoId, onSalvo }: { contratoId: string; onSalvo: () => void }) {
  const { pode } = usePodeUsar('contrato:editar');
  const [toleranciaAtrasoDias, setToleranciaAtrasoDias] = useState('');
  const [contratoAssinado, setContratoAssinado] = useState<'' | 'true' | 'false'>('');
  const [ajusteManualStatus, setAjusteManualStatus] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const mutacao = useMutation({
    mutationFn: () =>
      contratosApi.ajustar(contratoId, {
        ...(toleranciaAtrasoDias !== '' ? { toleranciaAtrasoDias: Number(toleranciaAtrasoDias) } : {}),
        ...(contratoAssinado !== '' ? { contratoAssinado: contratoAssinado === 'true' } : {}),
        ...(ajusteManualStatus !== '' ? { ajusteManualStatus } : {}),
        motivo,
      }),
    onSuccess: () => {
      setToleranciaAtrasoDias('');
      setContratoAssinado('');
      setAjusteManualStatus('');
      setMotivo('');
      setErro(null);
      onSalvo();
    },
    onError: () => setErro('não foi possível salvar o ajuste — confira o motivo e os valores'),
  });

  if (!pode) return null;

  return (
    <div className="mt-4 rounded-lg border border-slate-200 px-4 py-3">
      <h2 className="text-sm font-semibold text-slate-700">Ajuste manual</h2>
      <p className="mt-1 text-[11px] text-slate-400">
        `tolerância`/`contrato assinado` ficam até o próximo ajuste. O status pontual vence na
        leitura só até a próxima transação qualificada chegar — ela limpa o override
        automaticamente (o registro fica na auditoria).
      </p>
      <form
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!motivo.trim()) {
            setErro('motivo é obrigatório');
            return;
          }
          mutacao.mutate();
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Tolerância de atraso (dias)
          <input
            type="number"
            min={0}
            value={toleranciaAtrasoDias}
            onChange={(e) => setToleranciaAtrasoDias(e.target.value)}
            className="w-32 rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Contrato assinado
          <select
            value={contratoAssinado}
            onChange={(e) => setContratoAssinado(e.target.value as 'true' | 'false' | '')}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">sem mudança</option>
            <option value="true">sim</option>
            <option value="false">não</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Status (ajuste pontual)
          <select
            value={ajusteManualStatus}
            onChange={(e) => setAjusteManualStatus(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">sem mudança</option>
            {STATUS_CONTRATO.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-slate-500">
          Motivo (obrigatório)
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={mutacao.isPending}
          className="rounded-md bg-brand-azul px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {mutacao.isPending ? 'Salvando…' : 'Salvar ajuste'}
        </button>
      </form>
      {erro && <p className="mt-2 text-xs text-brand-coral">{erro}</p>}
    </div>
  );
}

/** Detalhe de um Contrato — linha do tempo de aditivos (spec 025). */
export function ContratoDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['contrato', id],
    queryFn: () => contratosApi.detalhe(id),
  });

  if (q.isLoading) return <p className="p-6 text-sm text-slate-500">Carregando…</p>;
  if (q.isError || !q.data)
    return (
      <section className="max-w-2xl p-6">
        <p className="text-sm text-brand-coral">Contrato não encontrado.</p>
        <Link to="/contratos" className="mt-4 inline-block text-sm text-brand-azul hover:underline">
          ← voltar
        </Link>
      </section>
    );

  const c = q.data;

  return (
    <section className="max-w-2xl">
      <Link to="/contratos" className="text-sm text-brand-azul hover:underline">
        ← Contratos
      </Link>

      <div className="mt-3">
        <h1 className="text-lg font-semibold text-slate-800">
          <Link to={`/pessoas/${c.pessoa.id}`} className="hover:underline">
            {c.pessoa.nome}
          </Link>{' '}
          · {c.produto.codigo}
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          status <strong>{c.statusCanonico}</strong> · acesso{' '}
          {c.acessoLiberado ? 'liberado' : 'não liberado'}
          {c.ajusteManualStatus && ' · via ajuste manual vigente'}
        </p>
      </div>

      <div className="mt-5 divide-y divide-slate-100 rounded-lg border border-slate-200 px-4 py-2">
        <Linha
          rotulo="Fim de acesso"
          valor={c.fimAcesso ? new Date(c.fimAcesso).toLocaleString() : 'sem aditivo válido'}
        />
        <Linha rotulo="Ticket total" valor={<span className="font-mono">{formatarDict(c.ticketTotal)}</span>} />
        <Linha
          rotulo="Valor recebido"
          valor={<span className="font-mono">{formatarDict(c.valorRecebido)}</span>}
        />
        <Linha rotulo="Tolerância de atraso" valor={`${c.toleranciaAtrasoDias} dia(s)`} />
        <Linha rotulo="Contrato assinado" valor={c.contratoAssinado ? 'sim' : 'não'} />
        {c.ajusteManualStatus && (
          <Linha
            rotulo="Ajuste manual vigente"
            valor={
              <>
                {c.ajusteManualStatus}
                {c.ajusteManualAutor ? ` · ${c.ajusteManualAutor}` : ''}
                {c.ajusteManualEm ? ` · ${new Date(c.ajusteManualEm).toLocaleString()}` : ''}
                {c.ajusteManualMotivo ? ` · "${c.ajusteManualMotivo}"` : ''}
              </>
            }
          />
        )}
      </div>

      <AjusteManualForm contratoId={c.id} onSalvo={() => qc.invalidateQueries({ queryKey: ['contrato', id] })} />

      <div className="mt-5">
        <h2 className="text-sm font-semibold text-slate-700">Linha do tempo de aditivos</h2>
        <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {c.aditivos.length === 0 && (
            <li className="px-4 py-4 text-sm text-slate-500">Nenhum aditivo ainda.</li>
          )}
          {c.aditivos.map((a) => (
            <li key={a.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <Link
                  to={`/financeiro/transacoes/${a.transacaoId}`}
                  className="text-sm font-medium text-brand-azul hover:underline"
                >
                  {ROTULO_LABEL[a.rotulo]}
                </Link>
                <span className="font-mono text-xs text-slate-500">{formatarDinheiro(a.valorBruto)}</span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                {a.ocorridoEm ? new Date(a.ocorridoEm).toLocaleString() : 'sem data'}
                {' · status da transação: '}
                {a.statusCanonicoTransacao}
                {a.fimAcessoResultante &&
                  ` · fim de acesso após este aditivo: ${new Date(a.fimAcessoResultante).toLocaleDateString()}`}
              </p>
              {a.precisaRevisao && (
                <p className="mt-1 text-xs text-amber-700">⚠ {a.motivoRevisao ?? 'precisa de revisão'}</p>
              )}
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-3 text-[11px] text-slate-400">
        criado em {new Date(c.criadoEm).toLocaleString()} · atualizado em{' '}
        {new Date(c.atualizadoEm).toLocaleString()}
      </p>
    </section>
  );
}
