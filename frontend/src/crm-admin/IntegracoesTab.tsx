import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePodeUsar } from '../auth/usePermissoes';
import { crmAdminApi, type IntegracaoView } from './crm-admin-api';

/**
 * Aba Integrações: lista com **máscara** do segredo; criação/rotação mostra o
 * valor pleno **uma única vez** num aviso destacado que não persiste ao recarregar.
 * Escrita só com `crm_admin:gerir_integracoes`.
 */
export function IntegracoesTab() {
  const qc = useQueryClient();
  const { pode: podeEditar } = usePodeUsar('crm_admin:gerir_integracoes');
  const lista = useQuery({
    queryKey: ['crm-admin', 'integracoes'],
    queryFn: () => crmAdminApi.listarIntegracoes({}),
  });

  const [revelado, setRevelado] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState('WEBHOOK');
  const [alvo, setAlvo] = useState('EXTERNO');
  const [segredo, setSegredo] = useState('');

  const invalidar = () => qc.invalidateQueries({ queryKey: ['crm-admin', 'integracoes'] });

  const criar = useMutation({
    mutationFn: () =>
      crmAdminApi.criarIntegracao({
        nome,
        tipo,
        alvo,
        config: {},
        ...(segredo ? { segredo } : {}),
      }),
    onSuccess: (r) => {
      setNome('');
      setSegredo('');
      if (r.apiKey) setRevelado(r.apiKey);
      void invalidar();
    },
  });

  const rotacionar = useMutation({
    mutationFn: (id: string) => crmAdminApi.rotacionar(id),
    onSuccess: (r) => {
      if (r.apiKey) setRevelado(r.apiKey);
      void invalidar();
    },
  });

  if (lista.isLoading) return <p className="text-sm text-slate-500">Carregando…</p>;
  if (lista.isError)
    return (
      <p className="text-sm text-brand-coral">Não foi possível carregar as integrações.</p>
    );

  return (
    <div className="flex flex-col gap-4">
      {revelado && (
        <aside
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <p className="font-medium">Guarde agora — não será exibido de novo:</p>
          <code className="mt-1 block break-all font-mono text-xs">{revelado}</code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(revelado);
            }}
            className="mt-2 rounded border border-amber-400 px-2 py-1 text-xs"
          >
            Copiar
          </button>
        </aside>
      )}

      {podeEditar && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (nome.trim()) criar.mutate();
          }}
          className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-3"
        >
          <input
            aria-label="Nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="nome"
            className="w-44 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <select
            aria-label="Tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="WEBHOOK">Webhook</option>
            <option value="API_KEY">API key</option>
            <option value="CONEXAO_INTERNA">Conexão interna</option>
          </select>
          <select
            aria-label="Alvo"
            value={alvo}
            onChange={(e) => setAlvo(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="EXTERNO">Externo</option>
            <option value="FINANCEIRO">Financeiro</option>
            <option value="MARKETING">Marketing</option>
            <option value="CENTRAL">Central</option>
          </select>
          {tipo !== 'API_KEY' && (
            <input
              aria-label="Segredo"
              value={segredo}
              onChange={(e) => setSegredo(e.target.value)}
              placeholder="segredo (opcional)"
              className="w-44 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          )}
          <button
            type="submit"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
            style={{ background: 'var(--color-brand-azul)' }}
          >
            Criar integração
          </button>
        </form>
      )}

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {lista.data!.itens.length === 0 && (
          <li className="px-4 py-6 text-sm text-slate-500">Nenhuma integração.</li>
        )}
        {lista.data!.itens.map((i: IntegracaoView) => (
          <li key={i.id} className="flex items-center justify-between px-4 py-3">
            <div className="min-w-0">
              <span className="text-sm font-medium text-slate-800">{i.nome}</span>
              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">
                {i.tipo} · {i.alvo}
              </span>
              <p className="mt-0.5 text-xs text-slate-500">
                {i.segredoDefinido
                  ? `segredo ${i.segredoMascarado}`
                  : 'sem segredo'}
                {!i.ativo && ' · inativa'}
              </p>
            </div>
            {podeEditar && i.segredoDefinido && (
              <button
                type="button"
                onClick={() => rotacionar.mutate(i.id)}
                className="shrink-0 text-xs text-brand-azul hover:underline"
              >
                rotacionar
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
