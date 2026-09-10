import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
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

      <p className="mt-3 text-[11px] text-slate-400">
        criada em {new Date(t.criadoEm).toLocaleString()} · atualizada em{' '}
        {new Date(t.atualizadoEm).toLocaleString()}
      </p>
    </section>
  );
}
