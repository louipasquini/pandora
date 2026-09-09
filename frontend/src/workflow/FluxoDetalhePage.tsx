import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { usePodeUsar } from '../auth/usePermissoes';
import { ESTAGIOS } from '../leads/leads-api';
import { ExecucoesTab } from './ExecucoesTab';
import { SimulacaoPanel } from './SimulacaoPanel';
import {
  ACAO_ROTULOS,
  GATILHO_ROTULOS,
  GATILHO_TIPOS,
  OPERADOR_ROTULOS,
  acoesCompativeis,
  camposDoGatilho,
  mensagemErro,
  workflowApi,
  type AcaoFluxo,
  type AcaoTipo,
  type CondicaoNo,
  type GatilhoTipo,
  type OperadorCondicao,
  type VersaoView,
} from './workflow-api';

interface CondicaoLinha {
  campo: string;
  operador: OperadorCondicao;
  valor: string;
}

function condicaoParaLinhas(no: CondicaoNo): { operador: 'E' | 'OU'; itens: CondicaoLinha[] } {
  if (no.tipo === 'folha') {
    return { operador: 'E', itens: [{ campo: no.campo, operador: no.operador, valor: String(no.valor ?? '') }] };
  }
  return {
    operador: no.operador,
    itens: no.itens
      .filter((i): i is Extract<CondicaoNo, { tipo: 'folha' }> => i.tipo === 'folha')
      .map((i) => ({ campo: i.campo, operador: i.operador, valor: String(i.valor ?? '') })),
  };
}

function linhasParaCondicao(
  operador: 'E' | 'OU',
  itens: CondicaoLinha[],
  campos: { campo: string; tipo: string }[],
): CondicaoNo {
  const folhas = itens
    .filter((i) => i.campo)
    .map((i) => {
      const campo = campos.find((c) => c.campo === i.campo);
      let valor: string | number | boolean = i.valor;
      if (i.operador !== 'definido' && i.operador !== 'nao_definido') {
        if (campo?.tipo === 'numero') valor = Number(i.valor);
        else if (campo?.tipo === 'booleano') valor = i.valor === 'true';
      }
      const folha: CondicaoNo =
        i.operador === 'definido' || i.operador === 'nao_definido'
          ? { tipo: 'folha', campo: i.campo, operador: i.operador }
          : { tipo: 'folha', campo: i.campo, operador: i.operador, valor };
      return folha;
    });
  return { tipo: 'grupo', operador, itens: folhas };
}

function acaoVazia(tipo: AcaoTipo): AcaoFluxo {
  switch (tipo) {
    case 'MOVER_LEAD_ESTAGIO':
      return { tipo, estagioDestino: ESTAGIOS[0] };
    case 'APLICAR_TAG':
    case 'REMOVER_TAG':
      return { tipo, tag: '' };
    case 'REGISTRAR_NOTA':
      return { tipo, conteudo: '' };
    case 'MOVER_OPORTUNIDADE_ETAPA':
      return { tipo, etapaDestinoId: '' };
    case 'CRIAR_TAREFA':
      return { tipo, titulo: '' };
  }
}

/** Editor de fluxo (spec 014, US1/US3): gatilho, condições E/OU, ações, publicar/arquivar. */
export function FluxoDetalhePage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const { pode: podeGerir } = usePodeUsar('crm_admin:gerir_workflow');
  const fluxo = useQuery({ queryKey: ['workflow', 'fluxo', id], queryFn: () => workflowApi.obterFluxo(id) });
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<'editor' | 'execucoes'>('editor');

  const [gatilhoTipo, setGatilhoTipo] = useState<GatilhoTipo>('LEAD_CRIADO');
  const [operadorGrupo, setOperadorGrupo] = useState<'E' | 'OU'>('E');
  const [condLinhas, setCondLinhas] = useState<CondicaoLinha[]>([]);
  const [acoes, setAcoes] = useState<AcaoFluxo[]>([]);

  const versaoBase: VersaoView | undefined = fluxo.data?.versaoRascunho ?? fluxo.data?.versaoPublicada ?? undefined;
  useEffect(() => {
    if (!versaoBase) return;
    setGatilhoTipo(versaoBase.gatilhoTipo);
    const c = condicaoParaLinhas(versaoBase.condicoes);
    setOperadorGrupo(c.operador);
    setCondLinhas(c.itens);
    setAcoes(versaoBase.acoes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versaoBase?.id]);

  const invalidar = () => qc.invalidateQueries({ queryKey: ['workflow', 'fluxo', id] });

  const salvarRascunho = useMutation({
    mutationFn: () => {
      const campos = camposDoGatilho(gatilhoTipo);
      return workflowApi.substituirRascunho(id, {
        gatilhoTipo,
        condicoes: linhasParaCondicao(operadorGrupo, condLinhas, campos),
        acoes,
      });
    },
    onSuccess: () => {
      setErro(null);
      void invalidar();
    },
    onError: (e: unknown) => setErro(mensagemErro(e)),
  });

  const publicar = useMutation({
    mutationFn: () => workflowApi.publicar(id),
    onSuccess: () => {
      setErro(null);
      void invalidar();
    },
    onError: (e: unknown) => setErro(mensagemErro(e)),
  });

  const arquivar = useMutation({
    mutationFn: () => workflowApi.arquivar(id),
    onSuccess: () => {
      setErro(null);
      void invalidar();
    },
    onError: (e: unknown) => setErro(mensagemErro(e)),
  });

  if (fluxo.isLoading) return <p className="p-6 text-sm text-slate-500">Carregando…</p>;
  if (fluxo.isError || !fluxo.data) {
    return <p className="p-6 text-sm text-brand-coral">Fluxo não encontrado.</p>;
  }
  const f = fluxo.data;
  const campos = camposDoGatilho(gatilhoTipo);
  const acoesPermitidas = acoesCompativeis(gatilhoTipo);

  return (
    <section className="max-w-3xl">
      <h1 className="text-xl font-semibold text-slate-800">{f.nome}</h1>
      {f.descricao && <p className="mt-1 text-sm text-slate-500">{f.descricao}</p>}

      <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
        <span>
          publicada:{' '}
          {f.versaoPublicada ? `v${f.versaoPublicada.numero} (${GATILHO_ROTULOS[f.versaoPublicada.gatilhoTipo]})` : '—'}
        </span>
        <span>rascunho: {f.versaoRascunho ? `v${f.versaoRascunho.numero}` : '—'}</span>
      </div>

      <div className="mt-4 flex gap-4 border-b border-slate-200 text-sm">
        <button
          type="button"
          onClick={() => setAba('editor')}
          className={aba === 'editor' ? 'border-b-2 border-brand-azul pb-2 font-medium' : 'pb-2 text-slate-500'}
        >
          Editor
        </button>
        <button
          type="button"
          onClick={() => setAba('execucoes')}
          className={aba === 'execucoes' ? 'border-b-2 border-brand-azul pb-2 font-medium' : 'pb-2 text-slate-500'}
        >
          Execuções
        </button>
      </div>

      {aba === 'execucoes' && (
        <div className="mt-4">
          <ExecucoesTab fluxoId={id} />
        </div>
      )}

      {aba === 'editor' && (
        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-slate-200 p-4">
            <label className="block text-sm font-medium text-slate-700">Gatilho</label>
            <select
              aria-label="Gatilho"
              value={gatilhoTipo}
              disabled={!podeGerir}
              onChange={(e) => {
                setGatilhoTipo(e.target.value as GatilhoTipo);
                setCondLinhas([]);
                setAcoes([]);
              }}
              className="mt-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            >
              {GATILHO_TIPOS.map((g) => (
                <option key={g} value={g}>
                  {GATILHO_ROTULOS[g]}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700">Condições</label>
              {condLinhas.length > 1 && (
                <select
                  aria-label="Combinar condições"
                  value={operadorGrupo}
                  disabled={!podeGerir}
                  onChange={(e) => setOperadorGrupo(e.target.value as 'E' | 'OU')}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                >
                  <option value="E">E (todas)</option>
                  <option value="OU">OU (qualquer uma)</option>
                </select>
              )}
            </div>
            {condLinhas.length === 0 && (
              <p className="mt-1 text-xs text-slate-400">sem condição — dispara sempre</p>
            )}
            {condLinhas.map((linha, i) => (
              <div key={i} className="mt-2 flex items-center gap-2">
                <select
                  aria-label="Campo"
                  value={linha.campo}
                  disabled={!podeGerir}
                  onChange={(e) => {
                    const novo = [...condLinhas];
                    novo[i] = { ...linha, campo: e.target.value };
                    setCondLinhas(novo);
                  }}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                >
                  <option value="">selecione</option>
                  {campos.map((c) => (
                    <option key={c.campo} value={c.campo}>
                      {c.campo}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Operador"
                  value={linha.operador}
                  disabled={!podeGerir}
                  onChange={(e) => {
                    const novo = [...condLinhas];
                    novo[i] = { ...linha, operador: e.target.value as OperadorCondicao };
                    setCondLinhas(novo);
                  }}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                >
                  {Object.entries(OPERADOR_ROTULOS).map(([op, rotulo]) => (
                    <option key={op} value={op}>
                      {rotulo}
                    </option>
                  ))}
                </select>
                {linha.operador !== 'definido' && linha.operador !== 'nao_definido' && (
                  <input
                    aria-label="Valor"
                    value={linha.valor}
                    disabled={!podeGerir}
                    onChange={(e) => {
                      const novo = [...condLinhas];
                      novo[i] = { ...linha, valor: e.target.value };
                      setCondLinhas(novo);
                    }}
                    className="w-32 rounded-md border border-slate-300 px-2 py-1 text-sm"
                  />
                )}
                {podeGerir && (
                  <button
                    type="button"
                    onClick={() => setCondLinhas(condLinhas.filter((_, j) => j !== i))}
                    className="text-xs text-brand-coral"
                  >
                    remover
                  </button>
                )}
              </div>
            ))}
            {podeGerir && (
              <button
                type="button"
                onClick={() =>
                  setCondLinhas([...condLinhas, { campo: campos[0]?.campo ?? '', operador: 'igual', valor: '' }])
                }
                className="mt-2 text-xs text-brand-azul"
              >
                + adicionar condição
              </button>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 p-4">
            <label className="text-sm font-medium text-slate-700">Ações</label>
            {acoes.length === 0 && <p className="mt-1 text-xs text-slate-400">nenhuma ação configurada</p>}
            {acoes.map((acao, i) => (
              <AcaoEditorLinha
                key={i}
                acao={acao}
                podeGerir={podeGerir}
                onChange={(nova) => {
                  const novo = [...acoes];
                  novo[i] = nova;
                  setAcoes(novo);
                }}
                onRemover={() => setAcoes(acoes.filter((_, j) => j !== i))}
              />
            ))}
            {podeGerir && (
              <select
                aria-label="Adicionar ação"
                value=""
                onChange={(e) => {
                  if (e.target.value) setAcoes([...acoes, acaoVazia(e.target.value as AcaoTipo)]);
                }}
                className="mt-2 rounded-md border border-slate-300 px-2 py-1 text-xs"
              >
                <option value="">+ adicionar ação</option>
                {acoesPermitidas.map((a) => (
                  <option key={a} value={a}>
                    {ACAO_ROTULOS[a]}
                  </option>
                ))}
              </select>
            )}
          </div>

          {erro && <p className="text-sm text-brand-coral">{erro}</p>}

          {podeGerir && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => salvarRascunho.mutate()}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              >
                Salvar rascunho
              </button>
              <button
                type="button"
                disabled={!f.versaoRascunho}
                onClick={() => publicar.mutate()}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
                style={{ background: 'var(--color-brand-azul)' }}
              >
                Publicar
              </button>
              <button
                type="button"
                disabled={!f.versaoPublicada}
                onClick={() => arquivar.mutate()}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40"
              >
                Arquivar
              </button>
            </div>
          )}

          <SimulacaoPanel fluxoId={id} gatilhoTipo={gatilhoTipo} />
        </div>
      )}
    </section>
  );
}

function AcaoEditorLinha({
  acao,
  podeGerir,
  onChange,
  onRemover,
}: {
  acao: AcaoFluxo;
  podeGerir: boolean;
  onChange: (a: AcaoFluxo) => void;
  onRemover: () => void;
}) {
  return (
    <div className="mt-2 flex items-center gap-2 text-sm">
      <span className="w-56 shrink-0 text-slate-700">{ACAO_ROTULOS[acao.tipo]}</span>
      {acao.tipo === 'MOVER_LEAD_ESTAGIO' && (
        <select
          aria-label="Estágio destino"
          value={acao.estagioDestino}
          disabled={!podeGerir}
          onChange={(e) => onChange({ ...acao, estagioDestino: e.target.value })}
          className="rounded-md border border-slate-300 px-2 py-1"
        >
          {ESTAGIOS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      )}
      {(acao.tipo === 'APLICAR_TAG' || acao.tipo === 'REMOVER_TAG') && (
        <input
          aria-label="Tag"
          value={acao.tag}
          disabled={!podeGerir}
          onChange={(e) => onChange({ ...acao, tag: e.target.value })}
          placeholder="tag"
          className="rounded-md border border-slate-300 px-2 py-1"
        />
      )}
      {acao.tipo === 'REGISTRAR_NOTA' && (
        <input
          aria-label="Conteúdo da nota"
          value={acao.conteudo}
          disabled={!podeGerir}
          onChange={(e) => onChange({ ...acao, conteudo: e.target.value })}
          placeholder="conteúdo da nota"
          className="flex-1 rounded-md border border-slate-300 px-2 py-1"
        />
      )}
      {acao.tipo === 'MOVER_OPORTUNIDADE_ETAPA' && (
        <>
          <input
            aria-label="Id da etapa destino"
            value={acao.etapaDestinoId}
            disabled={!podeGerir}
            onChange={(e) => onChange({ ...acao, etapaDestinoId: e.target.value })}
            placeholder="id da etapa destino"
            className="rounded-md border border-slate-300 px-2 py-1"
          />
          <input
            aria-label="Motivo"
            value={acao.motivo ?? ''}
            disabled={!podeGerir}
            onChange={(e) => onChange({ ...acao, motivo: e.target.value })}
            placeholder="motivo (obrigatório se a etapa for perdida)"
            className="flex-1 rounded-md border border-slate-300 px-2 py-1"
          />
        </>
      )}
      {acao.tipo === 'CRIAR_TAREFA' && (
        <>
          <input
            aria-label="Título da tarefa"
            value={acao.titulo}
            disabled={!podeGerir}
            onChange={(e) => onChange({ ...acao, titulo: e.target.value })}
            placeholder="título da tarefa"
            className="flex-1 rounded-md border border-slate-300 px-2 py-1"
          />
          <input
            aria-label="Prazo em dias"
            type="number"
            min={1}
            value={acao.prazoDias ?? ''}
            disabled={!podeGerir}
            onChange={(e) =>
              onChange({ ...acao, prazoDias: e.target.value ? Number(e.target.value) : undefined })
            }
            placeholder="prazo (dias)"
            className="w-28 rounded-md border border-slate-300 px-2 py-1"
          />
          <input
            aria-label="Responsável (vazio = geral)"
            value={acao.responsavelId ?? ''}
            disabled={!podeGerir}
            onChange={(e) => onChange({ ...acao, responsavelId: e.target.value || undefined })}
            placeholder="responsável (vazio = geral)"
            className="rounded-md border border-slate-300 px-2 py-1"
          />
        </>
      )}
      {podeGerir && (
        <button type="button" onClick={onRemover} className="shrink-0 text-xs text-brand-coral">
          remover
        </button>
      )}
    </div>
  );
}
