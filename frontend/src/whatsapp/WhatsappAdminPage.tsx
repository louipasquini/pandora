import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePodeUsar } from '../auth/usePermissoes';
import { STATUS_ROTULO, whatsappApi, type CanalWhatsappView } from './whatsapp-api';

/**
 * CRM · WhatsApp (spec 011) — configuração do canal (Cloud API da Meta) e
 * catálogo de templates. Leitura atrás de `crm_admin:ver`/`whatsapp:ver`;
 * escrita (criar/editar canal, sincronizar templates) só com
 * `crm_admin:gerir_whatsapp`. Campos de segredo são **só-escrita** — o valor
 * pleno nunca volta do backend, só a máscara.
 */
export function WhatsappAdminPage() {
  const qc = useQueryClient();
  const { pode: podeGerir } = usePodeUsar('crm_admin:gerir_whatsapp');
  const canais = useQuery({
    queryKey: ['whatsapp', 'canais'],
    queryFn: () => whatsappApi.listarCanais({}),
  });
  const [canalSelecionado, setCanalSelecionado] = useState<string | null>(null);

  const invalidarCanais = () => qc.invalidateQueries({ queryKey: ['whatsapp', 'canais'] });

  const [form, setForm] = useState({
    nome: '',
    numeroTelefone: '',
    wabaId: '',
    phoneNumberId: '',
    accessToken: '',
    appSecret: '',
    webhookVerifyToken: '',
  });

  const criar = useMutation({
    mutationFn: () => whatsappApi.criarCanal(form),
    onSuccess: () => {
      setForm({
        nome: '',
        numeroTelefone: '',
        wabaId: '',
        phoneNumberId: '',
        accessToken: '',
        appSecret: '',
        webhookVerifyToken: '',
      });
      void invalidarCanais();
    },
  });

  if (canais.isLoading) return <p className="text-sm text-slate-500">Carregando…</p>;
  if (canais.isError)
    return <p className="text-sm text-brand-coral">Não foi possível carregar os canais.</p>;

  return (
    <section className="max-w-4xl">
      <h1 className="text-xl font-semibold text-slate-800">CRM · WhatsApp</h1>
      <p className="mt-1 text-sm text-slate-500">
        Conexão com a Cloud API oficial da Meta e catálogo de templates aprovados.
      </p>

      {podeGerir && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (form.nome.trim() && form.phoneNumberId.trim()) criar.mutate();
          }}
          className="mt-6 flex flex-col gap-2 rounded-lg border border-slate-200 p-4"
        >
          <h2 className="text-sm font-medium text-slate-700">Conectar novo canal</h2>
          <div className="flex flex-wrap gap-2">
            <input
              aria-label="Nome"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="nome (ex.: AEN comercial)"
              className="w-52 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
            <input
              aria-label="Número de telefone"
              value={form.numeroTelefone}
              onChange={(e) => setForm({ ...form, numeroTelefone: e.target.value })}
              placeholder="+55 11 91234-5678"
              className="w-44 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
            <input
              aria-label="WABA ID"
              value={form.wabaId}
              onChange={(e) => setForm({ ...form, wabaId: e.target.value })}
              placeholder="WABA ID"
              className="w-36 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
            <input
              aria-label="Phone number ID"
              value={form.phoneNumberId}
              onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })}
              placeholder="phone number ID"
              className="w-40 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              aria-label="Access token"
              type="password"
              value={form.accessToken}
              onChange={(e) => setForm({ ...form, accessToken: e.target.value })}
              placeholder="access token"
              className="w-56 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
            <input
              aria-label="App secret"
              type="password"
              value={form.appSecret}
              onChange={(e) => setForm({ ...form, appSecret: e.target.value })}
              placeholder="app secret"
              className="w-56 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
            <input
              aria-label="Webhook verify token"
              type="password"
              value={form.webhookVerifyToken}
              onChange={(e) => setForm({ ...form, webhookVerifyToken: e.target.value })}
              placeholder="webhook verify token"
              className="w-56 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            className="mt-1 w-fit rounded-md px-3 py-1.5 text-sm font-medium text-white"
            style={{ background: 'var(--color-brand-azul)' }}
          >
            Conectar canal
          </button>
        </form>
      )}

      <ul className="mt-6 divide-y divide-slate-100 rounded-lg border border-slate-200">
        {canais.data!.itens.length === 0 && (
          <li className="px-4 py-6 text-sm text-slate-500">Nenhum canal conectado.</li>
        )}
        {canais.data!.itens.map((c: CanalWhatsappView) => (
          <li key={c.id} className="px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <span className="text-sm font-medium text-slate-800">{c.nome}</span>
                <span className="ml-2 text-xs text-slate-500">{c.numeroTelefone}</span>
                {!c.ativo && (
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">
                    inativo
                  </span>
                )}
                <p className="mt-0.5 text-xs text-slate-500">
                  token {c.accessTokenMascarado} · app secret {c.appSecretMascarado} · verify{' '}
                  {c.webhookVerifyTokenMascarado}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCanalSelecionado(canalSelecionado === c.id ? null : c.id)}
                className="shrink-0 text-xs text-brand-azul hover:underline"
              >
                {canalSelecionado === c.id ? 'ocultar templates' : 'ver templates'}
              </button>
            </div>
            {canalSelecionado === c.id && (
              <TemplatesDoCanal canalId={c.id} podeGerir={podeGerir} />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function TemplatesDoCanal({ canalId, podeGerir }: { canalId: string; podeGerir: boolean }) {
  const qc = useQueryClient();
  const templates = useQuery({
    queryKey: ['whatsapp', 'templates', canalId],
    queryFn: () => whatsappApi.listarTemplates(canalId),
  });
  const sincronizar = useMutation({
    mutationFn: () => whatsappApi.sincronizarTemplates(canalId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['whatsapp', 'templates', canalId] }),
  });

  return (
    <div className="mt-3 rounded-md border border-slate-100 bg-slate-50 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase text-slate-500">Templates</h3>
        {podeGerir && (
          <button
            type="button"
            onClick={() => sincronizar.mutate()}
            disabled={sincronizar.isPending}
            className="text-xs text-brand-azul hover:underline disabled:opacity-50"
          >
            {sincronizar.isPending ? 'sincronizando…' : 'sincronizar agora'}
          </button>
        )}
      </div>
      {templates.isLoading && <p className="mt-2 text-xs text-slate-500">Carregando…</p>}
      {templates.data && templates.data.length === 0 && (
        <p className="mt-2 text-xs text-slate-500">Nenhum template sincronizado ainda.</p>
      )}
      <ul className="mt-2 flex flex-col gap-1">
        {templates.data?.map((t) => (
          <li key={t.id} className="flex items-center gap-2 text-xs text-slate-700">
            <span className="font-mono">{t.nomeMeta}</span>
            <span className="text-slate-400">({t.idioma})</span>
            <span
              className={[
                'rounded px-1.5 py-0.5 uppercase',
                t.statusAprovacao === 'APROVADO'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-200 text-slate-600',
              ].join(' ')}
            >
              {STATUS_ROTULO[t.statusAprovacao]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
