import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePodeUsar } from '../auth/usePermissoes';
import { crmAdminApi } from '../crm-admin/crm-admin-api';
import { atendimentoApi, mensagemErro } from './atendimento-api';

/**
 * Administração do Chat ao Vivo (spec 012, FR-021) — SLA de 1ª resposta e
 * mensagem automática fora do expediente, por equipe `ATENDIMENTO`. Leitura
 * sob `crm_admin:ver`, escrita sob `crm_admin:gerir_atendimento`.
 */
export function AtendimentoAdminPage() {
  const { pode: podeGerir } = usePodeUsar('crm_admin:gerir_atendimento');
  const equipes = useQuery({
    queryKey: ['crm-admin', 'equipes', 'ATENDIMENTO'],
    queryFn: () => crmAdminApi.listarEquipes({ tipo: 'ATENDIMENTO', ativo: true, pagina: 1 }),
  });

  if (equipes.isLoading) return <p className="text-sm text-slate-500">Carregando…</p>;
  if (equipes.isError) return <p className="text-sm text-brand-coral">Não foi possível carregar as equipes.</p>;

  return (
    <section className="max-w-2xl">
      <h1 className="text-xl font-semibold text-slate-800">CRM · Chat ao Vivo — Administração</h1>
      <p className="mt-1 text-sm text-slate-500">
        Prazo de SLA de primeira resposta e mensagem automática fora do expediente, por equipe de atendimento.
      </p>

      {equipes.data!.itens.length === 0 && (
        <p className="mt-6 text-sm text-slate-500">Nenhuma equipe do tipo Atendimento cadastrada ainda.</p>
      )}

      <ul className="mt-6 flex flex-col gap-4">
        {equipes.data!.itens.map((e) => (
          <li key={e.id}>
            <ConfigEquipe equipeId={e.id} nome={e.nome} podeGerir={podeGerir} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ConfigEquipe({ equipeId, nome, podeGerir }: { equipeId: string; nome: string; podeGerir: boolean }) {
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const config = useQuery({
    queryKey: ['atendimento-config', equipeId],
    queryFn: () => atendimentoApi.obterConfigEquipe(equipeId),
  });
  const [sla, setSla] = useState('');
  const [mensagem, setMensagem] = useState('');

  const salvar = useMutation({
    mutationFn: () =>
      atendimentoApi.configurarEquipe(equipeId, {
        slaPrimeiraRespostaMinutos: sla.trim() ? Number(sla) : null,
        mensagemForaExpediente: mensagem.trim() || null,
      }),
    onSuccess: () => {
      setErro(null);
      void qc.invalidateQueries({ queryKey: ['atendimento-config', equipeId] });
    },
    onError: (e) => setErro(mensagemErro(e)),
  });

  if (config.isLoading) return null;

  const valorSla = sla || (config.data?.slaPrimeiraRespostaMinutos != null ? String(config.data.slaPrimeiraRespostaMinutos) : '');
  const valorMensagem = mensagem || config.data?.mensagemForaExpediente || '';

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <h2 className="text-sm font-medium text-slate-800">{nome}</h2>
      <div className="mt-2 flex flex-col gap-2">
        <label className="text-xs text-slate-600">
          SLA de 1ª resposta (minutos)
          <input
            aria-label={`SLA de ${nome}`}
            type="number"
            min={1}
            disabled={!podeGerir}
            value={valorSla}
            onChange={(e) => setSla(e.target.value)}
            placeholder="default do sistema"
            className="mt-1 w-40 rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50"
          />
        </label>
        <label className="text-xs text-slate-600">
          Mensagem automática fora do expediente
          <textarea
            aria-label={`Mensagem fora do expediente de ${nome}`}
            disabled={!podeGerir}
            value={valorMensagem}
            onChange={(e) => setMensagem(e.target.value)}
            rows={2}
            placeholder="sem mensagem configurada — nenhum aviso é enviado"
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50"
          />
        </label>
        {podeGerir && (
          <button
            type="button"
            onClick={() => salvar.mutate()}
            disabled={salvar.isPending}
            className="mt-1 w-fit rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--color-brand-azul)' }}
          >
            {salvar.isPending ? 'Salvando…' : 'Salvar'}
          </button>
        )}
        {erro && <p className="text-xs text-brand-coral">{erro}</p>}
      </div>
    </div>
  );
}
