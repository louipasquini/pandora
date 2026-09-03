import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { ApiError } from '../auth/ApiError';
import { useAuth } from '../auth/auth-context';

interface LocationState {
  from?: { pathname?: string };
}

/**
 * Tela de Login — credenciais de serviço (um único nível de acesso, spec 001).
 * Fora do `AppShell`. Mensagens de erro genéricas (FR-023).
 */
export function LoginPage() {
  const { status, login, logoutReason, persistente } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const destino = (location.state as LocationState | null)?.from?.pathname ?? '/';

  if (status === 'logado') {
    return <Navigate to={destino} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await login(clientId, clientSecret);
      navigate(destino, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setErro('Muitas tentativas. Aguarde um instante e tente de novo.');
      } else if (err instanceof ApiError && err.status === 401) {
        setErro('Credenciais inválidas.');
      } else {
        setErro('Não foi possível entrar. Verifique a conexão e tente de novo.');
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 p-6">
      <div className="w-full max-w-sm rounded-xl border border-black/10 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <span
            aria-hidden
            className="inline-block h-6 w-6 rounded-full"
            style={{ background: 'var(--color-brand-menta)' }}
          />
          <span className="text-lg font-semibold tracking-tight text-brand-azul">
            Projeto Pandora
          </span>
        </div>
        <h1 className="text-xl font-semibold text-slate-800">Entrar</h1>
        <p className="mt-1 text-sm text-slate-500">Use as credenciais de serviço da equipe.</p>

        {logoutReason === 'expirada' && (
          <p
            role="status"
            className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800"
          >
            Sua sessão expirou. Entre novamente.
          </p>
        )}
        {!persistente && (
          <p className="mt-4 rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-500">
            O armazenamento do navegador está indisponível: o login não vai persistir entre
            abas ou reinícios.
          </p>
        )}

        <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit}>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Client ID</span>
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-azul"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Client secret</span>
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-azul"
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {erro && (
            <p role="alert" className="text-sm text-brand-coral">
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="mt-2 rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: 'var(--color-brand-azul)' }}
          >
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
