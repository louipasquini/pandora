import {
  fmtDelta,
  fmtMoeda,
  fmtPct,
  type Delta,
  type FunilDados,
  type PainelView,
  type QualidadeAtendimentoDados,
  type RankingItem,
  type SerieTemporalDados,
  type TabelaDados,
  type VisaoGeralDados,
} from './dashboard-api';

function Cartao({ titulo, valor, delta }: { titulo: string; valor: string; delta?: Delta }) {
  const d = delta ? fmtDelta(delta) : null;
  const cor =
    d?.sinal === 'up' ? 'text-emerald-600' : d?.sinal === 'down' ? 'text-brand-coral' : 'text-slate-400';
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-800">{valor}</p>
      {d && <p className={`mt-0.5 text-xs ${cor}`}>{d.texto}</p>}
    </div>
  );
}

function PainelVisaoGeral({ dados }: { dados: VisaoGeralDados }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Cartao titulo="Leads novos" valor={String(dados.leadsNovos.valor)} delta={dados.leadsNovos} />
      <Cartao
        titulo="Oportunidades criadas"
        valor={String(dados.oportunidadesCriadas.valor)}
        delta={dados.oportunidadesCriadas}
      />
      <Cartao
        titulo="Ganhas"
        valor={String(dados.oportunidadesGanhas.valor)}
        delta={dados.oportunidadesGanhas}
      />
      <Cartao
        titulo="Perdidas"
        valor={String(dados.oportunidadesPerdidas.valor)}
        delta={dados.oportunidadesPerdidas}
      />
      <Cartao
        titulo="Taxa de conversão"
        valor={fmtPct(dados.taxaConversao)}
      />
      <Cartao
        titulo="Tarefas no prazo"
        valor={String(dados.tarefasConcluidasNoPrazo.valor)}
        delta={dados.tarefasConcluidasNoPrazo}
      />
      <div className="col-span-2 rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Valor em aberto</p>
        {dados.valorEmAberto.length === 0 ? (
          <p className="mt-1 text-sm text-slate-400">nenhum</p>
        ) : (
          <ul className="mt-1 space-y-0.5 text-sm font-semibold text-slate-800">
            {dados.valorEmAberto.map((v) => (
              <li key={v.moeda}>{fmtMoeda(v)}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PainelFunil({ dados }: { dados: FunilDados }) {
  if (!dados.pipelineId || dados.porEtapa.length === 0) {
    return <p className="text-sm text-slate-400">Sem pipeline ou sem dados no período.</p>;
  }
  const max = Math.max(1, ...dados.porEtapa.map((e) => e.quantidade));
  const corEtapa = (t: string) =>
    t === 'GANHA' ? 'bg-brand-menta' : t === 'PERDIDA' ? 'bg-brand-coral' : 'bg-brand-azul';
  return (
    <div className="space-y-2">
      {dados.porEtapa.map((e) => (
        <div key={e.etapaId} className="flex items-center gap-3">
          <span className="w-40 shrink-0 truncate text-sm text-slate-600" title={e.nome}>
            {e.nome}
          </span>
          <div className="relative h-6 flex-1 rounded bg-slate-100">
            <div
              className={`absolute inset-y-0 left-0 rounded ${corEtapa(e.tipo)}`}
              style={{ width: `${(e.quantidade / max) * 100}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-sm font-semibold text-slate-800">
            {e.quantidade}
          </span>
          <span className="w-40 shrink-0 text-right text-xs text-slate-500">
            {e.valorEstimado.map((v) => fmtMoeda(v)).join(' · ') || '—'}
          </span>
        </div>
      ))}
      <p className="pt-1 text-xs text-slate-500">
        Taxa de conversão: <strong>{fmtPct(dados.taxaConversao)}</strong>
      </p>
    </div>
  );
}

function PainelRanking({ itens }: { itens: RankingItem[] }) {
  if (itens.length === 0) return <p className="text-sm text-slate-400">Sem dados no período.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
          <th className="py-1">Responsável</th>
          <th className="py-1 text-right">Ganhas</th>
          <th className="py-1 text-right">Valor ganho</th>
          <th className="py-1 text-right">Conversão</th>
          <th className="py-1 text-right">Pontos</th>
        </tr>
      </thead>
      <tbody>
        {itens.map((i) => (
          <tr key={i.responsavelId} className="border-t border-slate-100">
            <td className="py-1.5">{i.nome ?? i.responsavelId.slice(0, 8)}</td>
            <td className="py-1.5 text-right font-semibold">{i.oportunidadesGanhas}</td>
            <td className="py-1.5 text-right text-slate-600">
              {i.valorGanho.map((v) => fmtMoeda(v)).join(' · ') || '—'}
            </td>
            <td className="py-1.5 text-right">{fmtPct(i.taxaConversao)}</td>
            <td className="py-1.5 text-right">{i.pontosTarefa}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PainelQualidadeAtendimento({ dados }: { dados: QualidadeAtendimentoDados }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cartao
          titulo="Tempo méd. 1ª resposta"
          valor={`${dados.tempoMedioPrimeiraRespostaMinutos.valor.toFixed(1)} min`}
          delta={dados.tempoMedioPrimeiraRespostaMinutos}
        />
        <Cartao titulo="Dentro do SLA" valor={fmtPct(dados.percentualDentroSla)} />
        <Cartao
          titulo="CSAT médio"
          valor={dados.csatMedio == null ? '—' : dados.csatMedio.toFixed(1)}
        />
        <Cartao titulo="Taxa de resolução" valor={fmtPct(dados.taxaResolucao)} />
      </div>
      <MiniSerie
        dados={dados.porDia.map((d) => ({ rotulo: d.rotulo, valor: d.abertos }))}
        rotulo="Atendimentos abertos por dia"
      />
      {dados.porAtendente.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-1">Atendente</th>
              <th className="py-1 text-right">Atendimentos</th>
              <th className="py-1 text-right">Tempo méd. resposta</th>
            </tr>
          </thead>
          <tbody>
            {dados.porAtendente.map((a) => (
              <tr key={a.atendenteId ?? 'sem'} className="border-t border-slate-100">
                <td className="py-1.5">{a.nome ?? a.atendenteId?.slice(0, 8) ?? '(sem atendente)'}</td>
                <td className="py-1.5 text-right">{a.atendimentos}</td>
                <td className="py-1.5 text-right">
                  {a.tempoMedioRespostaMinutos == null
                    ? '—'
                    : `${a.tempoMedioRespostaMinutos.toFixed(1)} min`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function MiniSerie({
  dados,
  rotulo,
}: {
  dados: { rotulo: string; valor: number }[];
  rotulo: string;
}) {
  if (dados.length === 0) return <p className="text-sm text-slate-400">Sem dados no período.</p>;
  const w = 600;
  const h = 120;
  const pad = 20;
  const max = Math.max(1, ...dados.map((d) => d.valor));
  const passo = dados.length > 1 ? (w - pad * 2) / (dados.length - 1) : 0;
  const pontos = dados.map((d, i) => {
    const x = pad + i * passo;
    const y = h - pad - (d.valor / max) * (h - pad * 2);
    return `${x},${y}`;
  });
  return (
    <figure>
      <figcaption className="mb-1 text-xs uppercase tracking-wide text-slate-500">{rotulo}</figcaption>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label={rotulo}>
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="text-brand-azul"
          points={pontos.join(' ')}
        />
        {dados.map((d, i) => (
          <circle
            key={d.rotulo}
            cx={pad + i * passo}
            cy={h - pad - (d.valor / max) * (h - pad * 2)}
            r={2.5}
            className="fill-brand-azul"
          >
            <title>{`${d.rotulo}: ${d.valor}`}</title>
          </circle>
        ))}
      </svg>
    </figure>
  );
}

function PainelSerieTemporal({ dados }: { dados: SerieTemporalDados }) {
  const cores = ['text-brand-azul', 'text-brand-menta', 'text-brand-coral'];
  const todosRotulos = [
    ...new Set(dados.series.flatMap((s) => s.pontos.map((p) => p.rotulo))),
  ].sort();
  if (todosRotulos.length === 0)
    return <p className="text-sm text-slate-400">Sem dados no período.</p>;
  const w = 600;
  const h = 160;
  const pad = 24;
  const max = Math.max(
    1,
    ...dados.series.flatMap((s) => s.pontos.map((p) => p.valor)),
  );
  const x = (i: number) =>
    pad + (todosRotulos.length > 1 ? (i * (w - pad * 2)) / (todosRotulos.length - 1) : 0);
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Série temporal">
        {dados.series.map((s, si) => {
          const mapa = new Map(s.pontos.map((p) => [p.rotulo, p.valor]));
          const pts = todosRotulos.map((r, i) => `${x(i)},${y(mapa.get(r) ?? 0)}`);
          return (
            <polyline
              key={s.nome}
              fill="none"
              strokeWidth={2}
              stroke="currentColor"
              className={cores[si % cores.length]}
              points={pts.join(' ')}
            />
          );
        })}
      </svg>
      <div className="mt-1 flex gap-4 text-xs">
        {dados.series.map((s, si) => (
          <span key={s.nome} className={cores[si % cores.length]}>
            ● {s.nome}
          </span>
        ))}
      </div>
    </div>
  );
}

function PainelTabela({ dados }: { dados: TabelaDados }) {
  if (dados.linhas.length === 0) return <p className="text-sm text-slate-400">Sem dados no período.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
            {dados.colunas.map((c) => (
              <th key={c} className="py-1">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dados.linhas.map((l, i) => (
            <tr key={i} className="border-t border-slate-100">
              {l.map((cel, j) => (
                <td key={j} className="py-1.5">
                  {String(cel)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PainelRender({ painel }: { painel: PainelView }) {
  switch (painel.id) {
    case 'visao_geral':
      return <PainelVisaoGeral dados={painel.dados as VisaoGeralDados} />;
    case 'funil_pipeline':
      return <PainelFunil dados={painel.dados as FunilDados} />;
    case 'ranking_comercial':
      return <PainelRanking itens={(painel.dados as { itens: RankingItem[] }).itens} />;
    case 'qualidade_atendimento':
      return <PainelQualidadeAtendimento dados={painel.dados as QualidadeAtendimentoDados} />;
    case 'leads_por_origem':
      return <PainelTabela dados={painel.dados as TabelaDados} />;
    case 'serie_oportunidades':
      return <PainelSerieTemporal dados={painel.dados as SerieTemporalDados} />;
    default:
      return <pre className="text-xs text-slate-400">{JSON.stringify(painel.dados, null, 2)}</pre>;
  }
}
