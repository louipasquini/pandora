import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePodeUsar } from '../auth/usePermissoes';
import { faqApi, mensagemErro, type FaqItemView } from './faq-api';

/**
 * Aba FAQ da CRM · Administração (spec 013, FR-001/FR-002). Leitura sob
 * `crm_admin:ver`; escrita (criar/editar/desativar) sob `crm_admin:gerir_faq`.
 * Toda edição de pergunta/resposta gera uma nova versão, consultável no
 * histórico de cada item. Base usada pela IA para sugerir respostas no Chat
 * ao Vivo (spec 012).
 */
export function FaqAdminPage() {
  const qc = useQueryClient();
  const { pode: podeGerir } = usePodeUsar('crm_admin:gerir_faq');
  const itens = useQuery({ queryKey: ['faq', 'admin'], queryFn: () => faqApi.listar() });
  const [expandido, setExpandido] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const invalidar = () => qc.invalidateQueries({ queryKey: ['faq'] });

  const [form, setForm] = useState({ pergunta: '', resposta: '' });
  const criar = useMutation({
    mutationFn: () => faqApi.criar(form),
    onSuccess: () => {
      setForm({ pergunta: '', resposta: '' });
      setErro(null);
      void invalidar();
    },
    onError: (e: unknown) => setErro(mensagemErro(e)),
  });

  if (itens.isLoading) return <p className="text-sm text-slate-500">Carregando…</p>;
  if (itens.isError)
    return <p className="text-sm text-brand-coral">Não foi possível carregar a FAQ.</p>;

  return (
    <div>
      {podeGerir && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (form.pergunta.trim() && form.resposta.trim()) criar.mutate();
          }}
          className="mt-6 flex flex-col gap-2 rounded-lg border border-slate-200 p-4"
        >
          <h2 className="text-sm font-medium text-slate-700">Novo item de FAQ</h2>
          <input
            aria-label="Pergunta"
            value={form.pergunta}
            onChange={(e) => setForm({ ...form, pergunta: e.target.value })}
            placeholder="Pergunta"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <textarea
            aria-label="Resposta"
            value={form.resposta}
            onChange={(e) => setForm({ ...form, resposta: e.target.value })}
            placeholder="Resposta"
            rows={3}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          {erro && <p className="text-sm text-brand-coral">{erro}</p>}
          <button
            type="submit"
            className="mt-1 w-fit rounded-md px-3 py-1.5 text-sm font-medium text-white"
            style={{ background: 'var(--color-brand-azul)' }}
          >
            Criar
          </button>
        </form>
      )}

      <ul className="mt-6 divide-y divide-slate-100 rounded-lg border border-slate-200">
        {itens.data!.length === 0 && (
          <li className="px-4 py-6 text-sm text-slate-500">Nenhum item de FAQ cadastrado.</li>
        )}
        {itens.data!.map((f) => (
          <li key={f.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="text-sm font-medium text-slate-800">{f.pergunta}</span>
                {!f.ativo && (
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">
                    inativo
                  </span>
                )}
                <p className="mt-0.5 text-sm text-slate-600">{f.resposta}</p>
              </div>
              <button
                type="button"
                onClick={() => setExpandido(expandido === f.id ? null : f.id)}
                className="shrink-0 text-xs text-brand-azul hover:underline"
              >
                {expandido === f.id ? 'ocultar' : 'editar / histórico'}
              </button>
            </div>
            {expandido === f.id && (
              <ItemFaqDetalhe item={f} podeGerir={podeGerir} onSalvou={invalidar} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ItemFaqDetalhe({
  item,
  podeGerir,
  onSalvou,
}: {
  item: FaqItemView;
  podeGerir: boolean;
  onSalvou: () => void;
}) {
  const versoes = useQuery({
    queryKey: ['faq', 'versoes', item.id],
    queryFn: () => faqApi.versoes(item.id),
  });
  const [pergunta, setPergunta] = useState(item.pergunta);
  const [resposta, setResposta] = useState(item.resposta);
  const [erro, setErro] = useState<string | null>(null);

  const salvar = useMutation({
    mutationFn: () => faqApi.atualizar(item.id, { pergunta, resposta }),
    onSuccess: onSalvou,
    onError: (e: unknown) => setErro(mensagemErro(e)),
  });
  const alternarAtivo = useMutation({
    mutationFn: () => faqApi.atualizar(item.id, { ativo: !item.ativo }),
    onSuccess: onSalvou,
    onError: (e: unknown) => setErro(mensagemErro(e)),
  });

  return (
    <div className="mt-3 rounded-md border border-slate-100 bg-slate-50 p-3">
      {podeGerir && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            salvar.mutate();
          }}
          className="flex flex-col gap-2"
        >
          <input
            aria-label="Editar pergunta"
            value={pergunta}
            onChange={(e) => setPergunta(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          <textarea
            aria-label="Editar resposta"
            value={resposta}
            onChange={(e) => setResposta(e.target.value)}
            rows={3}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          {erro && <p className="text-xs text-brand-coral">{erro}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              className="w-fit rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-white"
            >
              Salvar
            </button>
            <button
              type="button"
              onClick={() => alternarAtivo.mutate()}
              className="w-fit rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-white"
            >
              {item.ativo ? 'Desativar' : 'Ativar'}
            </button>
          </div>
        </form>
      )}

      <h3 className="mt-3 text-xs font-medium uppercase text-slate-500">Histórico de versões</h3>
      {versoes.isLoading && <p className="mt-1 text-xs text-slate-500">Carregando…</p>}
      <ul className="mt-1 flex flex-col gap-1">
        {versoes.data?.map((v) => (
          <li key={v.id} className="text-xs text-slate-600">
            <span className="text-slate-400">{new Date(v.criadoEm).toLocaleString('pt-BR')}</span>{' '}
            · {v.autor ?? 'desconhecido'} · <span className="italic">{v.pergunta}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
