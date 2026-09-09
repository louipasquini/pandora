import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePodeUsar } from '../auth/usePermissoes';
import type { InteracaoView } from './atendimento-api';
import { mensagemErroSugestao, sugestaoIaApi, type SugestaoIaView } from './sugestao-ia-api';

const TIPO_ROTULO: Record<SugestaoIaView['tipo'], string> = {
  RESPOSTA: 'Resposta sugerida',
  CAMPO_PERSONALIZADO: 'Campo personalizado sugerido',
};

/**
 * Painel de sugestão de IA (spec 013, US2..US5) — dentro da conversa do
 * Chat ao Vivo (012). Pedir sugestão para a mensagem de entrada selecionada;
 * cada sugestão é decidida (aceitar/rejeitar) independentemente das demais
 * (US3). Aceitar uma `RESPOSTA` **não envia nada** — só pré-preenche o
 * composer existente via `onUsarResposta` (D-R6); aceitar um
 * `CAMPO_PERSONALIZADO` grava direto no cadastro (backend). Feedback
 * (útil/não útil) só depois de decidida.
 */
export function PainelSugestoes({
  atendimentoId,
  timelineItens,
  podeAtender,
  onUsarResposta,
}: {
  atendimentoId: string;
  timelineItens: InteracaoView[] | undefined;
  podeAtender: boolean;
  onUsarResposta: (sugestaoId: string, conteudo: string) => void;
}) {
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const entradas = (timelineItens ?? []).filter((i) => i.direcao === 'ENTRADA');
  const [interacaoId, setInteracaoId] = useState<string>('');
  const interacaoEscolhida = interacaoId || entradas[entradas.length - 1]?.id || '';

  const sugestoes = useQuery({
    queryKey: ['atendimento', atendimentoId, 'sugestoes'],
    queryFn: () => sugestaoIaApi.listar(atendimentoId),
  });

  const invalidar = () => qc.invalidateQueries({ queryKey: ['atendimento', atendimentoId, 'sugestoes'] });

  function comErro<T>(fn: () => Promise<T>): Promise<T> {
    setErro(null);
    return fn().catch((e: unknown) => {
      setErro(mensagemErroSugestao(e));
      throw e;
    });
  }

  const gerar = useMutation({
    mutationFn: () => comErro(() => sugestaoIaApi.gerar(atendimentoId, interacaoEscolhida)),
    onSuccess: (r) => {
      setAviso(r.itens.length === 0 ? r.aviso ?? 'nenhuma sugestão disponível' : null);
      invalidar();
    },
  });
  const rejeitar = useMutation({
    mutationFn: (id: string) => comErro(() => sugestaoIaApi.rejeitar(atendimentoId, id)),
    onSuccess: invalidar,
  });
  const feedback = useMutation({
    mutationFn: (v: { id: string; util: boolean }) =>
      comErro(() => sugestaoIaApi.feedback(atendimentoId, v.id, v.util)),
    onSuccess: invalidar,
  });

  if (!podeAtender) return null;

  return (
    <div className="mt-3 rounded-lg border border-slate-200 p-3">
      <h3 className="text-xs font-medium uppercase text-slate-500">Sugestão de IA</h3>

      {entradas.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            aria-label="Mensagem para sugerir"
            value={interacaoEscolhida}
            onChange={(e) => setInteracaoId(e.target.value)}
            className="max-w-xs truncate rounded-md border border-slate-300 px-2 py-1 text-xs"
          >
            {entradas.map((i) => (
              <option key={i.id} value={i.id}>
                {i.conteudo.slice(0, 60)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => gerar.mutate()}
            disabled={gerar.isPending || !interacaoEscolhida}
            className="rounded-md px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--color-brand-menta)' }}
          >
            {gerar.isPending ? 'Pedindo…' : 'Pedir sugestão'}
          </button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-400">Nenhuma mensagem de entrada ainda.</p>
      )}

      {erro && <p className="mt-2 text-xs text-brand-coral">{erro}</p>}
      {aviso && <p className="mt-2 text-xs text-slate-500">Sem sugestão: {aviso}</p>}

      <ul className="mt-2 flex flex-col gap-2">
        {(sugestoes.data?.itens ?? [])
          .filter((s) => s.status !== 'SUBSTITUIDA')
          .map((s) => (
            <SugestaoItem
              key={s.id}
              atendimentoId={atendimentoId}
              sugestao={s}
              onUsarResposta={onUsarResposta}
              onRejeitar={() => rejeitar.mutate(s.id)}
              onFeedback={(util) => feedback.mutate({ id: s.id, util })}
              invalidar={invalidar}
              setErro={setErro}
            />
          ))}
      </ul>
    </div>
  );
}

function SugestaoItem({
  atendimentoId,
  sugestao,
  onUsarResposta,
  onRejeitar,
  onFeedback,
  invalidar,
  setErro,
}: {
  atendimentoId: string;
  sugestao: SugestaoIaView;
  onUsarResposta: (sugestaoId: string, conteudo: string) => void;
  onRejeitar: () => void;
  onFeedback: (util: boolean) => void;
  invalidar: () => void;
  setErro: (e: string | null) => void;
}) {
  const { pode: podeLeadEditar } = usePodeUsar('lead:editar');
  const { pode: podePessoaEditar } = usePodeUsar('pessoa:editar');
  const [valorFinal, setValorFinal] = useState(sugestao.conteudoSugerido);

  const aceitar = useMutation({
    mutationFn: () =>
      sugestaoIaApi.aceitar(
        atendimentoId,
        sugestao.id,
        valorFinal !== sugestao.conteudoSugerido ? valorFinal : undefined,
      ),
    onSuccess: (atualizada) => {
      setErro(null);
      if (sugestao.tipo === 'RESPOSTA') {
        onUsarResposta(atualizada.id, atualizada.conteudoFinal ?? sugestao.conteudoSugerido);
      }
      invalidar();
    },
    onError: (e: unknown) => setErro(mensagemErroSugestao(e)),
  });

  const podeGravarCampo = sugestao.campoPersonalizadoLeadId ? podeLeadEditar : podePessoaEditar;
  const pendente = sugestao.status === 'PENDENTE';
  const decidida = sugestao.status === 'ACEITA' || sugestao.status === 'REJEITADA';

  return (
    <li className="rounded-md border border-slate-100 bg-slate-50 p-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium text-slate-700">{TIPO_ROTULO[sugestao.tipo]}</span>
        <span className="uppercase text-slate-400">{sugestao.status}</span>
      </div>
      {sugestao.perguntaDetectada && (
        <p className="mt-0.5 italic text-slate-500">{sugestao.perguntaDetectada}</p>
      )}

      {pendente && sugestao.tipo === 'CAMPO_PERSONALIZADO' ? (
        <input
          aria-label="Valor final"
          value={valorFinal}
          onChange={(e) => setValorFinal(e.target.value)}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
        />
      ) : (
        <p className="mt-1 text-slate-600">{sugestao.conteudoFinal ?? sugestao.conteudoSugerido}</p>
      )}

      {pendente && (
        <div className="mt-1.5 flex gap-2">
          <button
            type="button"
            onClick={() => aceitar.mutate()}
            disabled={
              aceitar.isPending || (sugestao.tipo === 'CAMPO_PERSONALIZADO' && !podeGravarCampo)
            }
            className="rounded border border-slate-300 px-2 py-0.5 font-medium text-slate-700 hover:bg-white disabled:opacity-50"
            title={
              sugestao.tipo === 'CAMPO_PERSONALIZADO' && !podeGravarCampo
                ? 'sem permissão para editar o cadastro'
                : undefined
            }
          >
            Aceitar
          </button>
          <button
            type="button"
            onClick={onRejeitar}
            className="rounded border border-slate-300 px-2 py-0.5 font-medium text-slate-700 hover:bg-white"
          >
            Rejeitar
          </button>
        </div>
      )}

      {decidida && sugestao.util === null && (
        <div className="mt-1.5 flex items-center gap-2 text-slate-500">
          <span>foi útil?</span>
          <button type="button" onClick={() => onFeedback(true)} className="underline">
            sim
          </button>
          <button type="button" onClick={() => onFeedback(false)} className="underline">
            não
          </button>
        </div>
      )}
      {sugestao.util !== null && (
        <p className="mt-1.5 text-slate-400">feedback: {sugestao.util ? 'útil' : 'não útil'}</p>
      )}
    </li>
  );
}
