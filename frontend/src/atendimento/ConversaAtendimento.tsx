import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePodeUsar } from '../auth/usePermissoes';
import { TimelineInteracoes } from '../interacoes/TimelineInteracoes';
import { atendimentoApi, mensagemErro, STATUS_ROTULO, type AtendimentoView } from './atendimento-api';
import { CsatBadge } from './CsatBadge';
import { TransferirModal } from './TransferirModal';

/**
 * Conversa de um atendimento (spec 012, US1..US4). Reaproveita
 * `TimelineInteracoes` (009) em modo **leitura** para o histórico completo
 * da pessoa/lead (contexto além só do que este atendimento gerou); o
 * composer de resposta é o próprio — precisa passar por
 * `POST /crm/atendimentos/:id/responder` (fila/SLA/RespostaAtendimento/envio
 * de WhatsApp), não pela porta genérica de `interacao`.
 */
export function ConversaAtendimento({ atendimentoId }: { atendimentoId: string }) {
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const [conteudo, setConteudo] = useState('');
  const [viaIa, setViaIa] = useState(false);
  const [mostrarTransferir, setMostrarTransferir] = useState(false);
  const [nota, setNota] = useState(9);
  const [comentario, setComentario] = useState('');

  const { pode: podeAtender } = usePodeUsar('atendimento:atender');
  const { pode: podeTransferir } = usePodeUsar('atendimento:transferir');
  const { pode: podeEncerrar } = usePodeUsar('atendimento:encerrar');

  const detalhe = useQuery({
    queryKey: ['atendimento', atendimentoId],
    queryFn: () => atendimentoApi.obter(atendimentoId),
  });
  const timeline = useQuery({
    queryKey: ['atendimento', atendimentoId, 'timeline'],
    queryFn: () => atendimentoApi.timeline(atendimentoId),
  });

  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: ['atendimento', atendimentoId] });
    void qc.invalidateQueries({ queryKey: ['atendimento', atendimentoId, 'timeline'] });
    void qc.invalidateQueries({ queryKey: ['atendimentos'] });
  };

  function comErro<T>(fn: () => Promise<T>): Promise<T> {
    setErro(null);
    return fn().catch((e: unknown) => {
      setErro(mensagemErro(e));
      throw e;
    });
  }

  const assumir = useMutation({
    mutationFn: () => comErro(() => atendimentoApi.assumir(atendimentoId)),
    onSuccess: invalidar,
  });
  const responder = useMutation({
    mutationFn: () => comErro(() => atendimentoApi.responder(atendimentoId, { conteudo, viaIa })),
    onSuccess: () => {
      setConteudo('');
      setViaIa(false);
      invalidar();
    },
  });
  const transferir = useMutation({
    mutationFn: (dados: { paraAtendenteId?: string; paraEquipeId?: string; motivo?: string }) =>
      comErro(() => atendimentoApi.transferir(atendimentoId, dados)),
    onSuccess: () => {
      setMostrarTransferir(false);
      invalidar();
    },
  });
  const encerrar = useMutation({
    mutationFn: () => comErro(() => atendimentoApi.encerrar(atendimentoId)),
    onSuccess: invalidar,
  });
  const csat = useMutation({
    mutationFn: () => comErro(() => atendimentoApi.registrarCsat(atendimentoId, { nota, comentario: comentario || undefined })),
    onSuccess: () => {
      setComentario('');
      invalidar();
    },
  });

  if (detalhe.isLoading) return <p className="p-4 text-sm text-slate-500">Carregando…</p>;
  if (detalhe.isError || !detalhe.data) {
    return <p className="p-4 text-sm text-brand-coral">Não foi possível carregar o atendimento.</p>;
  }
  const a: AtendimentoView = detalhe.data;
  const ancora = a.pessoaId ? { pessoaId: a.pessoaId } : { leadId: a.leadId as string };

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">
            {STATUS_ROTULO[a.status]} · {a.canal === 'WHATSAPP' ? 'WhatsApp' : 'Manual'}
          </h2>
          <p className="text-xs text-slate-500">
            {a.status !== 'ENCERRADO' &&
              (a.sla.estourado
                ? 'SLA de 1ª resposta estourado'
                : a.sla.minutosRestantes != null
                  ? `${a.sla.minutosRestantes} min para o SLA de 1ª resposta`
                  : null)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CsatBadge timeline={timeline.data?.itens} />
          {podeAtender && a.status === 'AGUARDANDO' && (
            <button
              type="button"
              onClick={() => assumir.mutate()}
              disabled={assumir.isPending}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              style={{ background: 'var(--color-brand-azul)' }}
            >
              Assumir
            </button>
          )}
          {podeTransferir && a.status === 'EM_ATENDIMENTO' && (
            <button
              type="button"
              onClick={() => setMostrarTransferir(true)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Transferir
            </button>
          )}
          {podeEncerrar && a.status === 'EM_ATENDIMENTO' && (
            <button
              type="button"
              onClick={() => encerrar.mutate()}
              disabled={encerrar.isPending}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Encerrar
            </button>
          )}
        </div>
      </div>

      {erro && <p className="mt-2 text-xs text-brand-coral">{erro}</p>}

      {podeAtender && a.status === 'EM_ATENDIMENTO' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (conteudo.trim()) responder.mutate();
          }}
          className="mt-3 flex flex-col gap-2 rounded-lg border border-slate-200 p-3"
        >
          <textarea
            aria-label="Responder"
            value={conteudo}
            onChange={(ev) => setConteudo(ev.target.value)}
            placeholder="Escreva a resposta…"
            rows={2}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={viaIa} onChange={(ev) => setViaIa(ev.target.checked)} />
              assistida por IA
            </label>
            <button
              type="submit"
              disabled={responder.isPending || !conteudo.trim()}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              style={{ background: 'var(--color-brand-azul)' }}
            >
              {responder.isPending ? 'Enviando…' : 'Responder'}
            </button>
          </div>
        </form>
      )}

      {podeAtender && a.status === 'ENCERRADO' && a.csatSolicitadoEm && !timeline.data?.itens.some((i) => i.tipo === 'NPS') && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            csat.mutate();
          }}
          className="mt-3 flex flex-col gap-2 rounded-lg border border-slate-200 p-3"
        >
          <h3 className="text-xs font-medium text-slate-700">Registrar CSAT</h3>
          <div className="flex items-center gap-2">
            <input
              aria-label="Nota"
              type="number"
              min={0}
              max={10}
              value={nota}
              onChange={(ev) => setNota(Number(ev.target.value))}
              className="w-16 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
            <input
              aria-label="Comentário"
              value={comentario}
              onChange={(ev) => setComentario(ev.target.value)}
              placeholder="comentário (opcional)"
              className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
            <button
              type="submit"
              disabled={csat.isPending}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              style={{ background: 'var(--color-brand-azul)' }}
            >
              Salvar
            </button>
          </div>
        </form>
      )}

      <div className="mt-4">
        <h3 className="text-xs font-medium uppercase text-slate-500">Histórico completo</h3>
        <TimelineInteracoes ancora={ancora} podeRegistrar={false} podeGerir={false} />
      </div>

      {mostrarTransferir && (
        <TransferirModal
          pendente={transferir.isPending}
          onCancelar={() => setMostrarTransferir(false)}
          onConfirmar={(dados) => transferir.mutate(dados)}
        />
      )}
    </div>
  );
}
