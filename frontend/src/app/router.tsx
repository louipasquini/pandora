import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppShell } from '../shell/AppShell';
import { DashboardPlaceholder } from '../pages/DashboardPlaceholder';
import { LoginPage } from '../pages/LoginPage';
import { RequireAuth } from '../auth/RequireAuth';
import { RequirePermissao } from '../auth/RequirePermissao';
import { AdminPage } from '../admin/AdminPage';
import { PessoasListPage } from '../pessoas/PessoasListPage';
import { PessoaDetailPage } from '../pessoas/PessoaDetailPage';
import { ContasListPage } from '../contas/ContasListPage';
import { ContaDetailPage } from '../contas/ContaDetailPage';
import { EventosListPage } from '../eventos/EventosListPage';
import { EventoDetailPage } from '../eventos/EventoDetailPage';
import { CrmAdminPage } from '../crm-admin/CrmAdminPage';

/**
 * Roteamento client-side. `/login` é público e fica fora do `AppShell`. Todo o
 * resto passa por `<RequireAuth>` (spec 003): sem sessão válida → redireciona
 * para `/login`. `routes` é exportado separado para os testes montarem um
 * router de memória.
 */
export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <DashboardPlaceholder /> },
          {
            path: 'pessoas',
            element: (
              <RequirePermissao perm="pessoa:ver">
                <PessoasListPage />
              </RequirePermissao>
            ),
          },
          {
            path: 'pessoas/:id',
            element: (
              <RequirePermissao perm="pessoa:ver">
                <PessoaDetailPage />
              </RequirePermissao>
            ),
          },
          {
            path: 'contas',
            element: (
              <RequirePermissao perm="conta:ver">
                <ContasListPage />
              </RequirePermissao>
            ),
          },
          {
            path: 'contas/:id',
            element: (
              <RequirePermissao perm="conta:ver">
                <ContaDetailPage />
              </RequirePermissao>
            ),
          },
          {
            path: 'eventos',
            element: (
              <RequirePermissao perm="evento:ver">
                <EventosListPage />
              </RequirePermissao>
            ),
          },
          {
            path: 'eventos/:id',
            element: (
              <RequirePermissao perm="evento:ver">
                <EventoDetailPage />
              </RequirePermissao>
            ),
          },
          {
            path: 'admin',
            element: (
              <RequirePermissao perm="perfil:administrar">
                <AdminPage />
              </RequirePermissao>
            ),
          },
          {
            path: 'crm/admin',
            element: (
              <RequirePermissao perm="crm_admin:ver">
                <CrmAdminPage />
              </RequirePermissao>
            ),
          },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
