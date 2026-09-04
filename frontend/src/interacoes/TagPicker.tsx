import { useState } from 'react';
import { mensagemErro, tagsApi, type AncoraTag } from './interacoes-api';

/**
 * Chip picker de tags (spec 009) — reusado em Lead, Pessoa e Interação. O
 * catálogo é compartilhado (mesmo texto reaproveita a mesma tag); associar/
 * remover é idempotente no backend.
 */
export function TagPicker({
  ancora,
  tags,
  podeEditar,
  onChange,
}: {
  ancora: AncoraTag;
  tags: string[];
  podeEditar: boolean;
  onChange: () => void;
}) {
  const [novaTag, setNovaTag] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const semErro = <T,>(p: Promise<T>) =>
    p.then(onChange).catch((e: unknown) => setErro(mensagemErro(e)));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((t) => (
          <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
            {t}
            {podeEditar && (
              <button
                type="button"
                aria-label={`remover ${t}`}
                onClick={() => void semErro(tagsApi.desassociar(ancora, t))}
                className="ml-1 text-slate-400"
              >
                ×
              </button>
            )}
          </span>
        ))}
        {podeEditar && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (novaTag.trim()) {
                void semErro(tagsApi.associar(ancora, novaTag.trim()));
                setNovaTag('');
              }
            }}
          >
            <input
              aria-label="Nova tag"
              value={novaTag}
              onChange={(e) => setNovaTag(e.target.value)}
              placeholder="+ tag"
              className="w-24 rounded-md border border-slate-300 px-2 py-0.5 text-xs"
            />
          </form>
        )}
      </div>
      {erro && <p className="mt-1 text-xs text-brand-coral">{erro}</p>}
    </div>
  );
}
