import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  mensagemErro,
  registroTipoDoGatilho,
  workflowApi,
  type GatilhoTipo,
  type SimulacaoResultado,
} from './workflow-api';

/**
 * Simulação (spec 014, US2, D-03) — nunca escreve. Escolhe um registro real
 * (lead ou oportunidade, conforme o gatilho da versão em edição) e mostra o
 * que aconteceria, sem executar nada de fato.
 */
export function SimulacaoPanel({ fluxoId, gatilhoTipo }: { fluxoId: string; gatilhoTipo: GatilhoTipo }) {
  const registroTipo = registroTipoDoGatilho(gatilhoTipo);
  const [registroId, setRegistroId] = useState('');
  const [resultado, setResultado] = useState<SimulacaoResultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const simular = useMutation({
    mutationFn: () => {
      if (!registroTipo) throw new Error('gatilho por evento externo não é simulável');
      return workflowApi.simular(fluxoId, { registroTipo, registroId });
    },
    onSuccess: (r) => {
      setResultado(r);
      setErro(null);
    },
    onError: (e: unknown) => {
      setErro(mensagemErro(e));
      setResultado(null);
    },
  });

  if (!registroTipo) {
    return (
      <p className="text-sm text-slate-500">
        Gatilho por evento externo ainda não tem execução real — nada para simular.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <h3 className="text-sm font-medium text-slate-700">Simular</h3>
      <p className="mt-1 text-xs text-slate-500">
        Escolha o id de {registroTipo === 'LEAD' ? 'um lead' : 'uma oportunidade'} real — nada é
        alterado.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (registroId.trim()) simular.mutate();
        }}
        className="mt-2 flex gap-2"
      >
        <input
          aria-label={`Id d${registroTipo === 'LEAD' ? 'o lead' : 'a oportunidade'}`}
          value={registroId}
          onChange={(e) => setRegistroId(e.target.value)}
          placeholder={`id d${registroTipo === 'LEAD' ? 'o lead' : 'a oportunidade'}`}
          className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          Simular
        </button>
      </form>
      {erro && <p className="mt-2 text-sm text-brand-coral">{erro}</p>}
      {resultado && (
        <dl className="mt-3 space-y-1 text-sm">
          <div>
            <dt className="inline font-medium text-slate-600">gatilho compatível: </dt>
            <dd className="inline">{resultado.gatilhoCompativel ? 'sim' : 'não'}</dd>
          </div>
          <div>
            <dt className="inline font-medium text-slate-600">condição satisfeita: </dt>
            <dd className="inline">{resultado.condicaoSatisfeita ? 'sim' : 'não'}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-600">ações que disparariam:</dt>
            <dd>
              {resultado.acoesQueSeriamDisparadas.length === 0 && (
                <span className="text-slate-400">nenhuma</span>
              )}
              <ul className="list-inside list-disc">
                {resultado.acoesQueSeriamDisparadas.map((a, i) => (
                  <li key={i}>{a.tipo}</li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}
