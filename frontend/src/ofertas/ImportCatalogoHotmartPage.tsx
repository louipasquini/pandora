import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router';
import { apiFetch } from '../auth/api-client';

interface ResultadoImport {
  processadas: number;
  criadas: number;
  atualizadas: number;
  ignoradas: number;
}

async function lerArquivo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

function ResultadoView({ mut }: { mut: ReturnType<typeof useMutation<ResultadoImport, Error>> }) {
  return (
    <>
      {mut.isSuccess && (
        <p className="mt-2 text-sm text-emerald-700">
          {mut.data.processadas} processadas · {mut.data.criadas} criadas ·{' '}
          {mut.data.atualizadas} atualizadas · {mut.data.ignoradas} ignoradas
        </p>
      )}
      {mut.isError && (
        <p className="mt-2 text-sm text-brand-coral">Falha ao importar. Confira o arquivo.</p>
      )}
    </>
  );
}

function SeletorArquivo({
  rotulo,
  onSelect,
  onImportar,
  pendente,
}: {
  rotulo: string;
  onSelect: (f: File | null) => void;
  onImportar: () => void;
  pendente: boolean;
}) {
  return (
    <div className="mt-3 flex items-center gap-3">
      <input
        type="file"
        aria-label={rotulo}
        accept=".csv,text/csv"
        onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
        className="text-sm"
      />
      <button
        type="button"
        disabled={pendente}
        onClick={onImportar}
        className="rounded-md bg-brand-azul px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        Importar
      </button>
    </div>
  );
}

/**
 * Import do catálogo Hotmart (spec 023, D-11) — `produtos.csv`, `ofertas.csv`,
 * `lancamentos.csv` (`afiliados.csv` é escopo da spec 026). Só sob `oferta:editar`
 * (o `RequirePermissao` da rota já garante isso).
 */
export function ImportCatalogoHotmartPage() {
  const [conta, setConta] = useState<'HOTMART_PRD' | 'HOTMART_SVC'>('HOTMART_PRD');
  const [arqProdutos, setArqProdutos] = useState<File | null>(null);
  const [arqOfertas, setArqOfertas] = useState<File | null>(null);
  const [arqLancamentos, setArqLancamentos] = useState<File | null>(null);

  const importarProdutos = useMutation({
    mutationFn: async () => {
      if (!arqProdutos) throw new Error('selecione um arquivo');
      const csv = await lerArquivo(arqProdutos);
      return json<ResultadoImport>(
        await apiFetch('/catalogo/hotmart/importar-produtos', {
          method: 'POST',
          body: JSON.stringify({ csv }),
        }),
      );
    },
  });

  const importarOfertas = useMutation({
    mutationFn: async () => {
      if (!arqOfertas) throw new Error('selecione um arquivo');
      const csv = await lerArquivo(arqOfertas);
      return json<ResultadoImport>(
        await apiFetch('/catalogo/hotmart/importar-ofertas', {
          method: 'POST',
          body: JSON.stringify({ csv, conta }),
        }),
      );
    },
  });

  const importarLancamentos = useMutation({
    mutationFn: async () => {
      if (!arqLancamentos) throw new Error('selecione um arquivo');
      const csv = await lerArquivo(arqLancamentos);
      return json<ResultadoImport>(
        await apiFetch('/catalogo/hotmart/importar-lancamentos', {
          method: 'POST',
          body: JSON.stringify({ csv }),
        }),
      );
    },
  });

  return (
    <section className="max-w-2xl">
      <Link to="/ofertas" className="text-sm text-brand-azul hover:underline">
        ← Ofertas
      </Link>

      <h1 className="mt-3 text-lg font-semibold text-slate-800">Importar catálogo Hotmart</h1>
      <p className="mt-1 text-sm text-slate-500">
        3 CSVs exportados do painel Hotmart. `ofertas.csv` exige a coluna `price_code`
        completa — a Hotmart resolve oferta só por catálogo, nunca por tag.
      </p>

      <div className="mt-6 space-y-4">
        <div className="rounded-lg border border-slate-200 p-4">
          <h2 className="text-sm font-medium text-slate-700">produtos.csv</h2>
          <p className="mt-1 text-xs text-slate-500">Colunas: codigo, nome, assinatura.</p>
          <SeletorArquivo
            rotulo="Arquivo produtos.csv"
            onSelect={setArqProdutos}
            onImportar={() => importarProdutos.mutate()}
            pendente={!arqProdutos || importarProdutos.isPending}
          />
          <ResultadoView mut={importarProdutos} />
        </div>

        <div className="rounded-lg border border-slate-200 p-4">
          <h2 className="text-sm font-medium text-slate-700">ofertas.csv</h2>
          <p className="mt-1 text-xs text-slate-500">
            Colunas: price_code (obrigatória), produto_codigo, tag, nome.
          </p>
          <label className="mt-2 block text-sm">
            <span className="text-slate-500">Conta</span>
            <select
              value={conta}
              onChange={(e) => setConta(e.target.value as 'HOTMART_PRD' | 'HOTMART_SVC')}
              className="mt-1 block w-48 rounded-md border border-slate-300 px-3 py-1.5"
            >
              <option value="HOTMART_PRD">HOTMART_PRD</option>
              <option value="HOTMART_SVC">HOTMART_SVC</option>
            </select>
          </label>
          <SeletorArquivo
            rotulo="Arquivo ofertas.csv"
            onSelect={setArqOfertas}
            onImportar={() => importarOfertas.mutate()}
            pendente={!arqOfertas || importarOfertas.isPending}
          />
          <ResultadoView mut={importarOfertas} />
        </div>

        <div className="rounded-lg border border-slate-200 p-4">
          <h2 className="text-sm font-medium text-slate-700">lancamentos.csv</h2>
          <p className="mt-1 text-xs text-slate-500">
            Colunas: produto_codigo, rotulo, inicio, fim (YYYY-MM-DD).
          </p>
          <SeletorArquivo
            rotulo="Arquivo lancamentos.csv"
            onSelect={setArqLancamentos}
            onImportar={() => importarLancamentos.mutate()}
            pendente={!arqLancamentos || importarLancamentos.isPending}
          />
          <ResultadoView mut={importarLancamentos} />
        </div>
      </div>
    </section>
  );
}
