import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/auth-context';
import { lerSub } from '../auth/decode-jwt';
import {
  interacoesApi,
  mensagemErro,
  type AncoraInteracao,
  type InteracaoDirecao,
  type InteracaoTipo,
} from './interacoes-api';

const TIPOS: InteracaoTipo[] = ['NOTA', 'WHATSAPP', 'EMAIL', 'LIGACAO', 'TICKET', 'NPS'];
const TIPOS_COM_DIRECAO: InteracaoTipo[] = ['WHATSAPP', 'EMAIL', 'LIGACAO', 'TICKET'];

function rotuloTipo(t: InteracaoTipo): string {
  return { WHATSAPP: 'WhatsApp', EMAIL: 'E-mail', LIGACAO: 'Ligação', TICKET: 'Ticket', NOTA: 'Nota', NPS: 'NPS' }[t];
}

function chave(ancora: AncoraInteracao): unknown[] {
  return 'pessoaId' in ancora ? ['timeline', 'pessoa', ancora.pessoaId] : ['timeline', 'lead', ancora.leadId];
}

/**
 * Timeline unificada (spec 009) — reusada no detalhe de Pessoa e de Lead.
 * Composer visível só com `podeRegistrar`; editar/remover uma `NOTA` visível
 * só quando o sujeito é o autor **ou** tem `interacao:gerir` (a autorização
 * real é sempre do backend — isto é só UX).
 */
export function TimelineInteracoes({
  ancora,
  podeRegistrar,
  podeGerir,
}: {
  ancora: AncoraInteracao;
  podeRegistrar: boolean;
  podeGerir: boolean;
}) {
  const { token } = useAuth();
  const sujeitoId = token ? lerSub(token) : null;
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const [tipo, setTipo] = useState<InteracaoTipo>('NOTA');
  const [direcao, setDirecao] = useState<InteracaoDirecao>('SAIDA');
  const [conteudo, setConteudo] = useState('');
  const [notaNps, setNotaNps] = useState(8);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [conteudoEdicao, setConteudoEdicao] = useState('');

  const timeline = useQuery({ queryKey: chave(ancora), queryFn: () => interacoesApi.timeline(ancora) });
  const refetch = () => void qc.invalidateQueries({ queryKey: chave(ancora) });

  const criar = useMutation({
    mutationFn: () =>
      interacoesApi.criar(ancora, {
        tipo,
        ...(TIPOS_COM_DIRECAO.includes(tipo) ? { direcao } : {}),
        ...(tipo === 'NPS' ? { notaNps } : {}),
        conteudo,
      }),
    onSuccess: () => {
      setConteudo('');
      refetch();
    },
    onError: (e: unknown) => setErro(mensagemErro(e)),
  });
  const editar = useMutation({
    mutationFn: (id: string) => interacoesApi.editar(id, conteudoEdicao),
    onSuccess: () => {
      setEditandoId(null);
      refetch();
    },
    onError: (e: unknown) => setErro(mensagemErro(e)),
  });
  const remover = useMutation({
    mutationFn: (id: string) => interacoesApi.remover(id),
    onSuccess: refetch,
    onError: (e: unknown) => setErro(mensagemErro(e)),
  });

  return (
    <div>
      <h2 className="text-xs uppercase text-slate-400">Timeline</h2>
      {erro && <p className="mt-1 text-sm text-brand-coral">{erro}</p>}

      {podeRegistrar && (
        <form
          className="mt-2 space-y-2 rounded-md border border-slate-200 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            setErro(null);
            if (conteudo.trim()) criar.mutate();
          }}
        >
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as InteracaoTipo)}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            >
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {rotuloTipo(t)}
                </option>
              ))}
            </select>
            {TIPOS_COM_DIRECAO.includes(tipo) && (
              <select
                aria-label="Direção"
                value={direcao}
                onChange={(e) => setDirecao(e.target.value as InteracaoDirecao)}
                className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              >
                <option value="SAIDA">Saída</option>
                <option value="ENTRADA">Entrada</option>
              </select>
            )}
            {tipo === 'NPS' && (
              <input
                aria-label="Nota NPS"
                type="number"
                min={0}
                max={10}
                value={notaNps}
                onChange={(e) => setNotaNps(Number(e.target.value))}
                className="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
            )}
          </div>
          <textarea
            aria-label="Conteúdo"
            value={conteudo}
            onChange={(e) => setConteudo(e.target.value)}
            placeholder="Registrar interação…"
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
            rows={2}
          />
          <button
            type="submit"
            disabled={criar.isPending}
            className="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Registrar
          </button>
        </form>
      )}

      <ul className="mt-3 space-y-2">
        {(timeline.data?.itens ?? []).map((i) => {
          const editavel =
            i.tipo === 'NOTA' &&
            podeRegistrar &&
            (podeGerir || (sujeitoId != null && sujeitoId === i.autorId));
          return (
            <li key={i.id} className="rounded-md border border-slate-100 px-3 py-2 text-sm">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  <span className="font-medium text-slate-600">{rotuloTipo(i.tipo)}</span>
                  {i.direcao && ` · ${i.direcao}`}
                  {i.leadId && ' · via lead'}
                  {' · '}
                  {new Date(i.ocorridoEm).toLocaleString('pt-BR')}
                </span>
                {editavel && (
                  <span className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditandoId(i.id);
                        setConteudoEdicao(i.conteudo);
                      }}
                      className="text-brand-azul"
                    >
                      editar
                    </button>
                    <button
                      type="button"
                      onClick={() => remover.mutate(i.id)}
                      className="text-brand-coral"
                    >
                      remover
                    </button>
                  </span>
                )}
              </div>
              {editandoId === i.id ? (
                <form
                  className="mt-1 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    editar.mutate(i.id);
                  }}
                >
                  <input
                    aria-label="Editar conteúdo"
                    value={conteudoEdicao}
                    onChange={(e) => setConteudoEdicao(e.target.value)}
                    className="flex-1 rounded-md border border-slate-300 px-2 py-0.5 text-sm"
                  />
                  <button type="submit" className="text-xs text-brand-azul">
                    salvar
                  </button>
                </form>
              ) : (
                <p className="mt-1 text-slate-700">
                  {i.conteudo}
                  {i.removidoEm && <span className="ml-1 text-xs text-slate-400">(removida)</span>}
                  {i.editadoEm && !i.removidoEm && (
                    <span className="ml-1 text-xs text-slate-400">(editada)</span>
                  )}
                  {i.notaNps != null && <span className="ml-1 text-xs text-slate-400">nota {i.notaNps}</span>}
                </p>
              )}
            </li>
          );
        })}
        {(timeline.data?.itens ?? []).length === 0 && (
          <li className="text-sm text-slate-400">Nenhuma interação ainda.</li>
        )}
      </ul>
    </div>
  );
}
