import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { usePodeUsar } from '../auth/usePermissoes';
import {
  formatarDinheiro,
  ofertasApi,
  rotuloTurma,
  type CurarOfertaDto,
  type TurmaTipo,
} from './ofertas-api';

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-slate-500">{rotulo}</span>
      <span className="text-right text-slate-800">{valor ?? '—'}</span>
    </div>
  );
}

const TURMA_TIPOS: TurmaTipo[] = ['NUMERO', 'EVERGREEN', 'PERPETUO', 'DESCONHECIDO'];

/** Curadoria de uma oferta (spec 023): identidade + dados comerciais (`oferta_catalogo`). */
export function OfertaDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const { pode: podeEditar } = usePodeUsar('oferta:editar');

  const oferta = useQuery({
    queryKey: ['oferta', id],
    queryFn: () => ofertasApi.buscar(id),
  });

  const [turmaTipo, setTurmaTipo] = useState<TurmaTipo | ''>('');
  const [turmaNumero, setTurmaNumero] = useState('');
  const [ticketValor, setTicketValor] = useState('');
  const [ticketMoeda, setTicketMoeda] = useState('BRL');
  const [tempoAcessoDias, setTempoAcessoDias] = useState('');
  const [combo, setCombo] = useState(false);
  const [lancamento, setLancamento] = useState(false);
  const [bonusTexto, setBonusTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!oferta.data) return;
    setTurmaTipo(oferta.data.turma.tipo ?? '');
    setTurmaNumero(oferta.data.turma.numero != null ? String(oferta.data.turma.numero) : '');
    setTicketValor(
      oferta.data.catalogo?.ticket
        ? (Number(oferta.data.catalogo.ticket.valorInt) / 10000).toString()
        : '',
    );
    setTicketMoeda(oferta.data.catalogo?.ticket?.moeda ?? 'BRL');
    setTempoAcessoDias(
      oferta.data.catalogo?.tempoAcessoDias != null
        ? String(oferta.data.catalogo.tempoAcessoDias)
        : '',
    );
    setCombo(oferta.data.catalogo?.combo ?? false);
    setLancamento(oferta.data.catalogo?.lancamento ?? false);
    setBonusTexto((oferta.data.catalogo?.bonus ?? []).join('\n'));
  }, [oferta.data]);

  const curar = useMutation({
    mutationFn: () => {
      const dto: CurarOfertaDto = {};
      if (turmaTipo) dto.turmaTipo = turmaTipo;
      if (turmaTipo === 'NUMERO' && turmaNumero) dto.turmaNumero = Number(turmaNumero);

      const ticketNum = Number(ticketValor.replace(',', '.'));
      dto.catalogo = {
        ticket:
          ticketValor.trim() && !Number.isNaN(ticketNum)
            ? { valorInt: String(Math.round(ticketNum * 10000)), moeda: ticketMoeda }
            : undefined,
        tempoAcessoDias: tempoAcessoDias.trim() ? Number(tempoAcessoDias) : undefined,
        combo,
        lancamento,
        bonus: bonusTexto
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      };
      return ofertasApi.curar(id, dto);
    },
    onSuccess: (novo) => {
      setErro(null);
      qc.setQueryData(['oferta', id], novo);
    },
    onError: () => setErro('Não foi possível salvar. Confira os dados e tente de novo.'),
  });

  if (oferta.isLoading) return <p className="p-6 text-sm text-slate-500">Carregando…</p>;
  if (oferta.isError || !oferta.data)
    return (
      <section className="max-w-2xl p-6">
        <p className="text-sm text-brand-coral">Oferta não encontrada.</p>
        <Link to="/ofertas" className="mt-4 inline-block text-sm text-brand-azul hover:underline">
          ← voltar
        </Link>
      </section>
    );

  const o = oferta.data;

  return (
    <section className="max-w-2xl">
      <Link to="/ofertas" className="text-sm text-brand-azul hover:underline">
        ← Ofertas
      </Link>

      <h1 className="mt-3 text-lg font-semibold text-slate-800">
        <Link to={`/produtos/${o.produto.codigo}`} className="hover:underline">
          {o.produto.codigo}
        </Link>{' '}
        <span className="text-slate-400">·</span> {rotuloTurma(o.turma)}
      </h1>

      <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200 px-4 py-2">
        <Linha
          rotulo="Aliases de origem"
          valor={o.origensRef.map((r) => `${r.plataformaOrigem} (${r.tipoRef}: ${r.valorRef})`).join(', ') || '—'}
        />
        <Linha rotulo="Subproduto (código)" valor={o.subprodutoCodigo} />
        <Linha rotulo="Modelo de cobrança (código)" valor={o.modeloCobrancaCodigo} />
        <Linha rotulo="Modelo de transação (código)" valor={o.modeloTransacaoCodigo} />
        <Linha rotulo="Ticket" valor={formatarDinheiro(o.catalogo?.ticket ?? null)} />
        <Linha rotulo="Preço de tabela" valor={formatarDinheiro(o.catalogo?.precoTabela ?? null)} />
        <Linha rotulo="Tempo de acesso" valor={o.catalogo?.tempoAcessoDias ? `${o.catalogo.tempoAcessoDias} dias` : '—'} />
        <Linha rotulo="Combo" valor={o.catalogo?.combo ? 'sim' : 'não'} />
        <Linha rotulo="Bônus" valor={o.catalogo?.bonus.length ? o.catalogo.bonus.join(', ') : '—'} />
      </div>

      {podeEditar && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            curar.mutate();
          }}
          className="mt-5 space-y-3 rounded-lg border border-slate-200 p-4"
        >
          <h2 className="text-sm font-medium text-slate-700">Curadoria</h2>

          <div className="flex gap-3">
            <label className="flex-1 text-sm">
              <span className="text-slate-500">Turma</span>
              <select
                value={turmaTipo}
                onChange={(e) => setTurmaTipo(e.target.value as TurmaTipo)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5"
              >
                <option value="">não alterar</option>
                {TURMA_TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            {turmaTipo === 'NUMERO' && (
              <label className="w-32 text-sm">
                <span className="text-slate-500">Número</span>
                <input
                  value={turmaNumero}
                  onChange={(e) => setTurmaNumero(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5"
                />
              </label>
            )}
          </div>

          <h3 className="pt-2 text-xs font-medium uppercase text-slate-400">
            Dados comerciais (oferta_catalogo)
          </h3>

          <div className="flex gap-3">
            <label className="flex-1 text-sm">
              <span className="text-slate-500">Ticket</span>
              <input
                value={ticketValor}
                onChange={(e) => setTicketValor(e.target.value)}
                placeholder="197,00"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5"
              />
            </label>
            <label className="w-24 text-sm">
              <span className="text-slate-500">Moeda</span>
              <input
                value={ticketMoeda}
                onChange={(e) => setTicketMoeda(e.target.value.toUpperCase())}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5"
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="text-slate-500">Tempo de acesso (dias)</span>
            <input
              value={tempoAcessoDias}
              onChange={(e) => setTempoAcessoDias(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5"
            />
          </label>

          <label className="block text-sm">
            <span className="text-slate-500">Bônus (um por linha)</span>
            <textarea
              value={bonusTexto}
              onChange={(e) => setBonusTexto(e.target.value)}
              rows={3}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5"
            />
          </label>

          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={combo} onChange={(e) => setCombo(e.target.checked)} />
              combo
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={lancamento}
                onChange={(e) => setLancamento(e.target.checked)}
              />
              lançamento
            </label>
          </div>

          {erro && <p className="text-sm text-brand-coral">{erro}</p>}
          <button
            type="submit"
            disabled={curar.isPending}
            className="rounded-md bg-brand-azul px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Salvar
          </button>
        </form>
      )}
    </section>
  );
}
