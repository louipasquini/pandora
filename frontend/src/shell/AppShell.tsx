import { NavLink, Outlet } from 'react-router';
import { NAV_ITEMS } from './nav-items';
import { useAuth } from '../auth/auth-context';
import { usePermissoesEfetivas } from '../auth/usePermissoes';

/**
 * Shell de layout: cabeçalho da marca + navegação lateral + área de conteúdo
 * roteável (`<Outlet/>`). Grid CSS; sem rolagem horizontal do corpo em ≥ tablet
 * (FR-024, FR-028).
 */
export function AppShell() {
  const { logout, semPermissaoEm } = useAuth();
  const { permissoes } = usePermissoesEfetivas();
  const itens = NAV_ITEMS.filter(
    (item) => item.requerPermissao == null || permissoes.has(item.requerPermissao),
  );
  return (
    <div className="grid min-h-screen grid-rows-[auto_1fr] md:grid-cols-[16rem_1fr] md:grid-rows-[auto_1fr]">
      <header
        className="col-span-full flex items-center gap-3 px-6 py-4 text-brand-azul-contraste"
        style={{ background: 'var(--color-brand-azul)' }}
      >
        <span
          aria-hidden
          className="inline-block h-6 w-6 rounded-full"
          style={{ background: 'var(--color-brand-menta)' }}
        />
        <span className="text-lg font-semibold tracking-tight">Projeto Pandora</span>
        <span className="ml-auto text-sm opacity-80">Amor em Nutrir</span>
        <button
          type="button"
          onClick={() => logout()}
          className="rounded-md border border-white/30 px-3 py-1 text-sm hover:bg-white/10"
        >
          Sair
        </button>
      </header>

      <nav
        aria-label="Navegação principal"
        className="hidden border-r border-black/10 bg-white p-4 md:block"
      >
        <ul className="flex flex-col gap-1">
          {itens.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  [
                    'flex items-center justify-between rounded-md px-3 py-2 text-sm',
                    isActive ? 'font-semibold text-brand-azul' : 'text-slate-600 hover:bg-slate-100',
                  ].join(' ')
                }
              >
                <span>{item.label}</span>
                {item.soon && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-400">
                    em breve
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <main className="min-w-0 overflow-x-auto p-6">
        {semPermissaoEm != null && (
          <p
            key={semPermissaoEm}
            role="alert"
            className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800"
          >
            Você não tem permissão para essa ação.
          </p>
        )}
        <Outlet />
      </main>
    </div>
  );
}
