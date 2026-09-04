import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { atendimentoApi } from './atendimento-api';
import { FilaAtendimento } from './FilaAtendimento';
import { ConversaAtendimento } from './ConversaAtendimento';

/**
 * CRM · Chat ao Vivo (spec 012) — inbox de atendimento. Fila (aguardando +
 * em andamento, ordenada por prioridade/tempo de espera) à esquerda,
 * conversa selecionada à direita.
 */
export function AtendimentoInboxPage() {
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);

  const fila = useQuery({
    queryKey: ['atendimentos'],
    queryFn: () => atendimentoApi.listar({ status: ['AGUARDANDO', 'EM_ATENDIMENTO'] }),
    refetchInterval: 15_000,
  });

  return (
    <section className="flex h-[calc(100vh-8rem)] flex-col">
      <div className="mb-3">
        <h1 className="text-xl font-semibold text-slate-800">CRM · Chat ao Vivo</h1>
        <p className="mt-1 text-sm text-slate-500">
          Fila de atendimento com endereçamento automático por carga/disponibilidade.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-slate-200">
        <div className="w-80 shrink-0 overflow-y-auto border-r border-slate-200">
          {fila.isLoading && <p className="p-4 text-sm text-slate-500">Carregando…</p>}
          {fila.isError && <p className="p-4 text-sm text-brand-coral">Não foi possível carregar a fila.</p>}
          {fila.data && (
            <FilaAtendimento itens={fila.data.itens} selecionadoId={selecionadoId} onSelecionar={setSelecionadoId} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          {selecionadoId ? (
            <ConversaAtendimento atendimentoId={selecionadoId} />
          ) : (
            <p className="p-4 text-sm text-slate-500">Selecione uma conversa na fila.</p>
          )}
        </div>
      </div>
    </section>
  );
}
