import type { ReactNode } from 'react';
import { Link, Outlet } from 'react-router';
import { usePermissoesEfetivas } from './usePermissoes';

/**
 * Gate de rota por permissão (spec 004). Sem a permissão → tela "sem permissão"
 * (FR-032) — **nunca** redireciona para `/login` (isso é ausência de sessão, 401).
 */
export function RequirePermissao({
  perm,
  children,
}: {
  perm: string;
  children?: ReactNode;
}) {
  const { permissoes, isLoading } = usePermissoesEfetivas();

  if (isLoading) {
    return (
      <p role="status" className="p-6 text-sm text-slate-500">
        Carregando permissões…
      </p>
    );
  }
  if (!permissoes.has(perm)) return <SemPermissao />;
  return <>{children ?? <Outlet />}</>;
}

export function SemPermissao() {
  return (
    <section className="mx-auto max-w-md p-10 text-center">
      <h1 className="text-lg font-semibold text-slate-800">
        Você não tem permissão para acessar isto
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        Fale com quem administra os acessos da equipe se acha que deveria ter acesso.
      </p>
      <Link
        to="/"
        className="mt-6 inline-block rounded-md px-4 py-2 text-sm font-medium text-brand-azul hover:bg-slate-100"
      >
        Voltar para a Visão geral
      </Link>
    </section>
  );
}
