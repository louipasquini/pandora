/**
 * Conteúdo mínimo da rota "/" na spec 001. O dashboard real (Financeiro/CRM)
 * chega nas specs 017 / 030 / 043.
 */
export function DashboardPlaceholder() {
  return (
    <section>
      <h1 className="text-2xl font-semibold text-brand-azul">Visão geral</h1>
      <p className="mt-2 max-w-prose text-slate-600">
        Esqueleto do painel Pandora (spec 001). Backend, banco, testes e CI estão de pé; as
        telas de cada módulo entram nas próximas specs.
      </p>
      <dl className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-black/10 bg-white p-4">
          <dt className="text-xs uppercase tracking-wide text-slate-400">Marca</dt>
          <dd className="mt-2 flex gap-2">
            <span className="h-6 w-6 rounded" style={{ background: 'var(--color-brand-azul)' }} />
            <span className="h-6 w-6 rounded" style={{ background: 'var(--color-brand-coral)' }} />
            <span className="h-6 w-6 rounded" style={{ background: 'var(--color-brand-menta)' }} />
          </dd>
        </div>
      </dl>
    </section>
  );
}
