import { useSearchParams } from 'react-router';
import { PerfisTab } from './PerfisTab';
import { UsuariosTab } from './UsuariosTab';

type Aba = 'perfis' | 'usuarios';

/** Administração (spec 004) — abas Perfis | Usuários. Atrás de `perfil:administrar`. */
export function AdminPage() {
  const [params, setParams] = useSearchParams();
  const aba: Aba = params.get('aba') === 'usuarios' ? 'usuarios' : 'perfis';

  return (
    <section className="max-w-4xl">
      <h1 className="text-xl font-semibold text-slate-800">Administração</h1>
      <p className="mt-1 text-sm text-slate-500">Perfis de acesso e permissões da equipe.</p>

      <div className="mt-6 flex gap-1 border-b border-slate-200" role="tablist">
        {(['perfis', 'usuarios'] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={aba === k}
            onClick={() => setParams({ aba: k })}
            className={[
              'px-4 py-2 text-sm font-medium',
              aba === k
                ? 'border-b-2 border-brand-azul text-brand-azul'
                : 'text-slate-500 hover:text-slate-700',
            ].join(' ')}
          >
            {k === 'perfis' ? 'Perfis' : 'Usuários'}
          </button>
        ))}
      </div>

      <div className="mt-6">{aba === 'perfis' ? <PerfisTab /> : <UsuariosTab />}</div>
    </section>
  );
}
