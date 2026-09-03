import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './auth-context';

/**
 * Portão de rota: sem sessão válida, redireciona para `/login` guardando a
 * origem em `state.from` (o Login volta para lá após autenticar). Uma mudança
 * de `status` para `deslogado` (logout ou 401) re-renderiza e navega **uma**
 * vez.
 */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'deslogado') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}
