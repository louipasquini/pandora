import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { TentarVincularButton } from './TentarVincularButton';
import {
  formatarDinheiro,
  transacoesApi,
  type DinheiroView,
} from './transacoes-api';

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-slate-500">{rotulo}</span>
      <span className="text-right text-slate-800">{valor ?? '—'}</span>
    </div>
  );
}

function Valor({ d }: { d: DinheiroView | null }) {
  return <span className="font-mono">{formatarDinheiro(d)}</span>;
}

/** Detalhe de uma transação normalizada (spec 018). */
export function TransacaoDetailPage() {
  const { id = '' } = useParams();
  const q = useQuery({
    queryKey: ['transacao', id],
    queryFn: () => transacoesApi.detalhe(id),
  });

  if (q.isLoading) return <p className="p-6 text-sm text-slate-500">Carregando…</p>;
  if (q.isError || !q.data)
    return (
      <section className="max-w-2xl p-6">
        <p className="text-sm text-brand-coral">Transação não encontrada.</p>
        <Link
          to="/financeiro/transacoes"
          className="mt-4 inline-block text-sm text-brand-azul hover:underline"
        >
          ← voltar
        </Link>
      </section>
    );

  const t = q.data;

  return (
    <section className="max-w-2xl">
      <Link to="/financeiro/transacoes" className="text-sm text-brand-azul hover:underline">
        ← Transações
      </Link>

      <div className="mt-3">
        <h1 className="text-lg font-semibold text-slate-800">
          {t.plataformaOrigem} · <span className="font-mono">{t.idOrigem}</span>
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          {t.classificacao}
          {t.ehAfiliada ? ' · afiliada' : ''} · status <strong>{t.statusCanonico}</strong>
          {' '}(bruto: {t.statusOrigem})
        </p>
        {t.precisaRevisao && (
          <p className="mt-1 text-xs text-amber-700">⚠ {t.motivoRevisao ?? 'precisa de revisão'}</p>
        )}
      </div>

      <div className="mt-5 divide-y divide-slate-100 rounded-lg border border-slate-200 px-4 py-2">
        <Linha rotulo="Ocorrido em" valor={t.ocorridoEm ? new Date(t.ocorridoEm).toLocaleString() : 'sem data'} />
        <Linha
          rotulo="Cliente"
          valor={
            t.pessoa ? (
              <Link to={`/pessoas/${t.pessoa.id}`} className="text-brand-azul hover:underline">
                {t.pessoa.nome}
              </Link>
            ) : (
              'não resolvido'
            )
          }
        />
        <Linha rotulo="Valor bruto" valor={<Valor d={t.valorBruto} />} />
        <Linha rotulo="Valor líquido" valor={<Valor d={t.valorLiquido} />} />
        <Linha rotulo="Taxas" valor={<Valor d={t.taxas} />} />
        <Linha rotulo="Reembolso" valor={<Valor d={t.reembolso} />} />
        <Linha rotulo="Quantidade" valor={t.quantidade ?? '—'} />
        <Linha
          rotulo="Recorrência"
          valor={t.ehRecorrencia ? `${t.assinaturaCiclo ?? 'sim'}${t.numeroCiclo ? ` #${t.numeroCiclo}` : ''}` : 'não'}
        />
        <Linha rotulo="Oferta (código de origem)" valor={t.ofertaCodigoOrigem ?? '—'} />
        <Linha rotulo="Oferta (nome de origem)" valor={t.ofertaNomeOrigem ?? '—'} />
        <Linha
          rotulo="Evento de origem"
          valor={
            t.eventoOrigemId ? (
              <Link to={`/eventos/${t.eventoOrigemId}`} className="text-brand-azul hover:underline">
                ver evento
              </Link>
            ) : (
              '—'
            )
          }
        />
      </div>

      {(t.vinculo || t.vinculoPendente) && (
        <div className="mt-4 rounded-lg border border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-700">Vínculo Asaas↔Guru</h2>
          {t.vinculo ? (
            <>
              <p className="mt-1 text-xs text-slate-500">
                Cobrança terceirizada — vinculada à venda de registro em{' '}
                <Link
                  to={`/financeiro/transacoes/${t.vinculo.transacaoVinculadaId}`}
                  className="text-brand-azul hover:underline"
                >
                  ver transação Guru
                </Link>
                . Resolvido em {new Date(t.vinculo.resolvidoEm).toLocaleString()}.
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                Essa transação não conta como receita própria — só a venda Guru soma.
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 text-xs text-amber-700">
                ⚠ pendente de vínculo — a venda Guru correspondente ainda não chegou.
              </p>
              <div className="mt-2">
                <TentarVincularButton transacaoId={t.id} />
              </div>
            </>
          )}
        </div>
      )}

      <p className="mt-3 text-[11px] text-slate-400">
        criada em {new Date(t.criadoEm).toLocaleString()} · atualizada em{' '}
        {new Date(t.atualizadoEm).toLocaleString()}
      </p>
    </section>
  );
}
