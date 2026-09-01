import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppShell } from '../shell/AppShell';
import { DashboardPlaceholder } from '../pages/DashboardPlaceholder';

/**
 * Roteamento client-side. Rota de layout (`AppShell`) envolve as rotas filhas
 * via `<Outlet/>` (FR-025). Só a "/" existe na spec 001. `routes` é exportado
 * separado para os testes montarem um router de memória.
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [{ index: true, element: <DashboardPlaceholder /> }],
  },
];

export const router = createBrowserRouter(routes);
