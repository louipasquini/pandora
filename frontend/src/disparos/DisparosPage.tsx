import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { apiFetch } from '../auth/api-client';
import { usePodeUsar } from '../auth/usePermissoes';
import {
  disparosApi,
  STATUS_DISPARO_ROTULO,
  type CriarDisparoBody,
  type ExecucaoDisparoStatus,
} from './disparos-api';

interface CanalOpcao {
  id: string;
  nome: string;
}
interface TemplateOpcao {
  id: string;
  nomeMeta: string;
  statusAprovacao: string;
}
interface SegmentoOpcao {
  id: string;
  nome: string;
  alvo: 'LEAD' | 'PESSOA';
}

function useOpcoes() {
  const canais = useQuery({
    queryKey: ['disparos', 'canais-opcoes'],
    queryFn: () =>
      apiFetch('/crm/admin/whatsapp/canais')
        .then((r) => r.json())
        .then((b: { itens: CanalOpcao[] }) => b.itens),
  });
  const segmentos = useQuery({
    queryKey: ['disparos', 'segmentos-opcoes'],
    queryFn: () =>
      apiFetch('/crm/segmentos')
        .then((r) => r.json())
        .then((b: { itens: SegmentoOpcao[] }) => b.itens),
  });
  return { canais: canais.data ?? [], segmentos: segmentos.data ?? [] };
}

function useTemplatesDoCanl(canalId: string) {
  const q = useQuery({
    queryKey: ['disparos', 'templates-opcoes', canalId],
    enabled: canalId !== '',
    queryFn: () =>
      apiFetch(`/crm/admin/whatsapp/canais/${canalId}/templates?statusAprovacao=APROVADO`)
        .then((r) => r.json())
        .then((b: TemplateOpcao[]) => b),
  });
  return q.data ?? [];
}

function NovoDisparoForm({ onClose, onCriou }: { onClose: () => void; onCriou: () => void }) {
  const { canais, segmentos } = useOpcoes();
  const [nome, setNome] = useState('');
  const [canalId, setCanalId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [segmentoId, setSegmentoId] = useState('');
  const [comAB, setComAB] = useState(false);
  const [templateBId, setTemplateBId] = useState('');
  const [percentualVarianteB, setPercentualVarianteB] = useState(50);
  const [agendadoPara, setAgendadoPara] = useState('');
  const [csvConteudo, setCsvConteudo] = useState<string | null>(null);
  const [csvNomeArquivo, setCsvNomeArquivo] = useState('');
  const [criarLead, setCriarLead] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const templates = useTemplatesDoCanl(canalId);

  const criar = useMutation({
    mutationFn: (body: CriarDisparoBody) => disparosApi.criar(body),
    onSuccess: () => onCriou(),
    onError: async (err: unknown) => {
      setErro(err instanceof Error ? err.message : 'não foi possível criar o disparo');
    },
  });

  async function lerArquivo(file: File) {
    const texto = await file.text();
    setCsvConteudo(texto);
    setCsvNomeArquivo(file.name);
  }

  function enviar() {
    setErro(null);
    if (!nome.trim() || !canalId || !templateId) {
      setErro('preencha nome, canal e template');
      return;
    }
    if (!segmentoId && !csvConteudo) {
      setErro('escolha um segmento ou importe um CSV de contatos');
      return;
    }
    criar.mutate({
      nome: nome.trim(),
      canalId,
      templateId,
      segmentoId: segmentoId || undefined,
      templateBId: comAB && templateBId ? templateBId : undefined,
      percentualVarianteB: comAB && templateBId ? percentualVarianteB : undefined,
      csvConteudo: csvConteudo ?? undefined,
      criarLead: csvConteudo ? criarLead : undefined,
      agendadoPara: agendadoPara ? new Date(agendadoPara).toISOString() : undefined,
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        enviar();
      }}
      className="mt-6 flex flex-col gap-3 rounded-lg border border-slate-200 p-4"
    >
      <h2 className="text-sm font-medium text-slate-700">Novo disparo</h2>

      <input
        aria-label="Nome do disparo"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="nome (ex.: Abertura do lançamento X)"
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
      />

      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Canal"
          value={canalId}
          onChange={(e) => {
            setCanalId(e.target.value);
            setTemplateId('');
          }}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="">canal…</option>
          {canais.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>

        <select
          aria-label="Template"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="">template aprovado…</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nomeMeta}
            </option>
          ))}
        </select>

        <select
          aria-label="Segmento"
          value={segmentoId}
          onChange={(e) => setSegmentoId(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="">sem segmento…</option>
          {segmentos.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome} ({s.alvo})
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={comAB} onChange={(e) => setComAB(e.target.checked)} />
        Teste A/B (duas variantes de mensagem)
      </label>
      {comAB && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Template variante B"
            value={templateBId}
            onChange={(e) => setTemplateBId(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">template da variante B…</option>
            {templates
              .filter((t) => t.id !== templateId)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nomeMeta}
                </option>
              ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            % para a variante B
            <input
              aria-label="Percentual da variante B"
              type="number"
              min={0}
              max={100}
              value={percentualVarianteB}
              onChange={(e) => setPercentualVarianteB(Number(e.target.value))}
              className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-sm text-slate-600" htmlFor="disparo-csv">
          Importar contatos por CSV (opcional — telefone[,nome])
        </label>
        <input
          id="disparo-csv"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void lerArquivo(file);
          }}
        />
        {csvNomeArquivo && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>{csvNomeArquivo}</span>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={criarLead}
                onChange={(e) => setCriarLead(e.target.checked)}
              />
              criar Lead para contatos novos
            </label>
          </div>
        )}
      </div>

      <label className="flex flex-col gap-1 text-sm text-slate-600">
        Agendar para (vazio = enviar agora)
        <input
          aria-label="Agendar para"
          type="datetime-local"
          value={agendadoPara}
          onChange={(e) => setAgendadoPara(e.target.value)}
          className="w-64 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
      </label>

      {erro && <p className="text-sm text-brand-coral">{erro}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={criar.isPending}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          style={{ background: 'var(--color-brand-azul)' }}
        >
          Criar disparo
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600"
        >
          cancelar
        </button>
      </div>
    </form>
  );
}

/** Visão geral e construtor de disparos de WhatsApp (spec 015). */
export function DisparosPage() {
  const [criando, setCriando] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState<ExecucaoDisparoStatus | ''>('');
  const { pode: podeCriar } = usePodeUsar('disparo:criar');
  const qc = useQueryClient();

  const lista = useQuery({
    queryKey: ['disparos', 'lista', filtroStatus],
    queryFn: () => disparosApi.listar({ status: filtroStatus || undefined }),
  });

  const invalidar = () => qc.invalidateQueries({ queryKey: ['disparos', 'lista'] });

  return (
    <section className="max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">CRM · Disparos</h1>
          <p className="mt-1 text-sm text-slate-500">
            Envio em massa de WhatsApp por segmento e/ou lista importada de contatos.
          </p>
        </div>
        {podeCriar && !criando && (
          <button
            type="button"
            onClick={() => setCriando(true)}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
            style={{ background: 'var(--color-brand-azul)' }}
          >
            Novo disparo
          </button>
        )}
      </div>

      {criando && podeCriar && (
        <NovoDisparoForm
          onClose={() => setCriando(false)}
          onCriou={() => {
            setCriando(false);
            invalidar();
          }}
        />
      )}

      <div className="mt-4 flex gap-2">
        <select
          aria-label="Filtrar por status"
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value as ExecucaoDisparoStatus | '')}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="">todos os status</option>
          {Object.entries(STATUS_DISPARO_ROTULO).map(([v, r]) => (
            <option key={v} value={v}>
              {r}
            </option>
          ))}
        </select>
      </div>

      {lista.isLoading && <p className="mt-6 text-sm text-slate-500">Carregando…</p>}
      {lista.isError && <p className="mt-6 text-sm text-brand-coral">Não foi possível carregar os disparos.</p>}

      {lista.data && (
        <ul className="mt-4 divide-y divide-slate-100 rounded border border-slate-200">
          {lista.data.itens.map((d) => {
            const enviadas = d.contagens.find((c) => c.status === 'ENVIADA')?.total ?? 0;
            const falhas = d.contagens.find((c) => c.status === 'FALHOU')?.total ?? 0;
            return (
              <li key={d.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <Link to={`/crm/disparos/${d.id}`} className="font-medium text-brand-azul">
                  {d.nome}
                </Link>
                <span className="text-xs text-slate-400">
                  {STATUS_DISPARO_ROTULO[d.status]} · {enviadas} enviadas
                  {falhas > 0 ? ` · ${falhas} falhas` : ''}
                </span>
              </li>
            );
          })}
          {lista.data.itens.length === 0 && (
            <li className="px-3 py-6 text-center text-slate-400">nenhum disparo</li>
          )}
        </ul>
      )}
    </section>
  );
}
