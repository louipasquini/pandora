import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router';
import {
  mensagemErro,
  pipelinesApi,
  type EtapaTipo,
  type ModoAtribuicao,
} from './pipelines-api';

/**
 * Administração de um pipeline (spec 010, US1/US4/US6) — atrás de
 * `crm_admin:gerir_pipelines`. Etapas, atribuição automática e campos
 * personalizados de oportunidade.
 */
export function PipelineAdminPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;

  return (
    <section className="max-w-3xl">
      <h1 className="text-xl font-semibold text-slate-800">Administrar pipeline</h1>
      <div className="mt-6 flex flex-col gap-8">
        <EtapasSection pipelineId={id} />
        <AtribuicaoSection pipelineId={id} />
        <CamposSection />
      </div>
    </section>
  );
}

function EtapasSection({ pipelineId }: { pipelineId: string }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState('');
  const [ordem, setOrdem] = useState(0);
  const [tipo, setTipo] = useState<EtapaTipo>('ABERTA');
  const [erro, setErro] = useState<string | null>(null);

  const etapas = useQuery({
    queryKey: ['pipeline-etapas', pipelineId],
    queryFn: () => pipelinesApi.listarEtapas(pipelineId),
  });

  const criar = useMutation({
    mutationFn: () => pipelinesApi.criarEtapa(pipelineId, { nome, ordem, tipo }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pipeline-etapas', pipelineId] });
      setNome('');
    },
    onError: (e: unknown) => setErro(mensagemErro(e)),
  });

  const remover = useMutation({
    mutationFn: (etapaId: string) => pipelinesApi.removerEtapa(pipelineId, etapaId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['pipeline-etapas', pipelineId] }),
    onError: (e: unknown) => setErro(mensagemErro(e)),
  });

  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-700">Etapas</h2>
      <ul className="mt-2 divide-y divide-slate-100 rounded border border-slate-200">
        {(etapas.data?.itens ?? []).map((e) => (
          <li key={e.id} className="flex items-center justify-between px-3 py-2 text-sm">
            <span>
              {e.ordem}. {e.nome} <span className="text-xs text-slate-400">({e.tipo})</span>
            </span>
            <button
              type="button"
              onClick={() => remover.mutate(e.id)}
              className="text-xs text-brand-coral"
            >
              remover
            </button>
          </li>
        ))}
        {etapas.data?.itens.length === 0 && (
          <li className="px-3 py-4 text-center text-sm text-slate-400">nenhuma etapa</li>
        )}
      </ul>

      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setErro(null);
          criar.mutate();
        }}
      >
        <input
          aria-label="Nome da etapa"
          required
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="nome"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <input
          aria-label="Ordem"
          type="number"
          value={ordem}
          onChange={(e) => setOrdem(Number(e.target.value))}
          className="w-20 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <select
          aria-label="Tipo da etapa"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as EtapaTipo)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="ABERTA">Aberta</option>
          <option value="GANHA">Ganha</option>
          <option value="PERDIDA">Perdida</option>
        </select>
        <button
          type="submit"
          className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
          style={{ background: 'var(--color-brand-azul)' }}
        >
          Adicionar etapa
        </button>
      </form>
      {erro && <p className="mt-2 text-sm text-brand-coral">{erro}</p>}
    </div>
  );
}

function AtribuicaoSection({ pipelineId }: { pipelineId: string }) {
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const [modo, setModo] = useState<ModoAtribuicao>('MANUAL');

  const atribuicao = useQuery({
    queryKey: ['pipeline-atribuicao', pipelineId],
    queryFn: () => pipelinesApi.obterAtribuicao(pipelineId),
  });

  const salvar = useMutation({
    mutationFn: () =>
      pipelinesApi.substituirAtribuicao(pipelineId, {
        modoAtribuicao: modo,
        atribuicaoFallback: null,
        regras: atribuicao.data?.regras ?? [],
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['pipeline-atribuicao', pipelineId] }),
    onError: (e: unknown) => setErro(mensagemErro(e)),
  });

  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-700">Atribuição automática</h2>
      <p className="mt-1 text-xs text-slate-500">
        Modo atual: {atribuicao.data?.modoAtribuicao ?? '—'}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <select
          aria-label="Modo de atribuição"
          value={modo}
          onChange={(e) => setModo(e.target.value as ModoAtribuicao)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="MANUAL">Manual</option>
          <option value="RODIZIO">Rodízio (round robin)</option>
          <option value="REGRA">Por regra</option>
        </select>
        <button
          type="button"
          onClick={() => {
            setErro(null);
            salvar.mutate();
          }}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600"
        >
          Salvar
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        Rodízio/regra exigem uma equipe configurada no pipeline (edição avançada fora desta
        tela).
      </p>
      {erro && <p className="mt-2 text-sm text-brand-coral">{erro}</p>}
    </div>
  );
}

function CamposSection() {
  const qc = useQueryClient();
  const [chave, setChave] = useState('');
  const [rotulo, setRotulo] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const defs = useQuery({
    queryKey: ['campos-oportunidade'],
    queryFn: () => pipelinesApi.listarCamposDefs(),
  });

  const criar = useMutation({
    mutationFn: () => pipelinesApi.criarCampoDef({ chave, rotulo, tipo: 'TEXTO' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['campos-oportunidade'] });
      setChave('');
      setRotulo('');
    },
    onError: (e: unknown) => setErro(mensagemErro(e)),
  });

  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-700">Campos personalizados de oportunidade</h2>
      <ul className="mt-2 divide-y divide-slate-100 rounded border border-slate-200">
        {(defs.data?.itens ?? []).map((d) => (
          <li key={d.id} className="px-3 py-2 text-sm">
            {d.rotulo} <span className="text-xs text-slate-400">({d.chave} · {d.tipo})</span>
          </li>
        ))}
        {defs.data?.itens.length === 0 && (
          <li className="px-3 py-4 text-center text-sm text-slate-400">nenhum campo</li>
        )}
      </ul>
      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setErro(null);
          criar.mutate();
        }}
      >
        <input
          aria-label="Chave do campo"
          required
          value={chave}
          onChange={(e) => setChave(e.target.value)}
          placeholder="chave (slug)"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <input
          aria-label="Rótulo do campo"
          required
          value={rotulo}
          onChange={(e) => setRotulo(e.target.value)}
          placeholder="rótulo"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
          style={{ background: 'var(--color-brand-azul)' }}
        >
          Adicionar campo (texto)
        </button>
      </form>
      {erro && <p className="mt-2 text-sm text-brand-coral">{erro}</p>}
    </div>
  );
}
