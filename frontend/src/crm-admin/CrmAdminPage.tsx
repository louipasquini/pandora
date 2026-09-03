import { useSearchParams } from 'react-router';
import { EquipesTab } from './EquipesTab';
import { ExpedienteTab } from './ExpedienteTab';
import { IntegracoesTab } from './IntegracoesTab';

type Aba = 'equipes' | 'expediente' | 'integracoes';
const ABAS: { k: Aba; label: string }[] = [
  { k: 'equipes', label: 'Equipes' },
  { k: 'expediente', label: 'Expediente' },
  { k: 'integracoes', label: 'Integrações' },
];

/**
 * CRM · Administração (spec 007) — abas Equipes | Expediente | Integrações.
 * Atrás de `crm_admin:ver`; os controles de escrita de cada aba aparecem só com
 * a permissão `crm_admin:gerir_*` correspondente.
 */
export function CrmAdminPage() {
  const [params, setParams] = useSearchParams();
  const aba = (params.get('tab') as Aba) || 'equipes';
  const atual: Aba = ABAS.some((a) => a.k === aba) ? aba : 'equipes';

  return (
    <section className="max-w-4xl">
      <h1 className="text-xl font-semibold text-slate-800">CRM · Administração</h1>
      <p className="mt-1 text-sm text-slate-500">
        Times do comercial, horários de atendimento e integrações.
      </p>

      <div className="mt-6 flex gap-1 border-b border-slate-200" role="tablist">
        {ABAS.map((a) => (
          <button
            key={a.k}
            role="tab"
            aria-selected={atual === a.k}
            onClick={() => setParams({ tab: a.k })}
            className={[
              'px-4 py-2 text-sm font-medium',
              atual === a.k
                ? 'border-b-2 border-brand-azul text-brand-azul'
                : 'text-slate-500 hover:text-slate-700',
            ].join(' ')}
          >
            {a.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {atual === 'equipes' && <EquipesTab />}
        {atual === 'expediente' && <ExpedienteTab />}
        {atual === 'integracoes' && <IntegracoesTab />}
      </div>
    </section>
  );
}
