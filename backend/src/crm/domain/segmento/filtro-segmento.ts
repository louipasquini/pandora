/**
 * Filtro de `segmento` (spec 009, CL-03 — query salva declarativa). Puro:
 * `validarFiltro` (esquema fechado por `alvo`, zod `.strict()`) e
 * `construirWhere` (monta a condição Prisma-like, **não executa**) rodam sem
 * banco. `SegmentoService.listarMembros` combina o resultado com o `where` de
 * escopo de visão antes de tocar o Postgres.
 */
import { z } from 'zod';

const uuid = z.string().uuid();
const iso = z.string().datetime({ offset: true }).or(z.string().datetime());

const filtroLeadSchema = z
  .object({
    estagio: z
      .array(z.enum(['NOVO', 'CONTATO_FEITO', 'QUALIFICADO', 'NUTRICAO', 'DESQUALIFICADO']))
      .optional(),
    status: z.array(z.enum(['ATIVO', 'DESCARTADO', 'CONVERTIDO'])).optional(),
    origem: z.array(z.string().trim().min(1)).optional(),
    tags: z.array(z.string().trim().min(1)).optional(),
    responsavelId: z.array(uuid).optional(),
    campoPersonalizado: z
      .array(z.object({ chave: z.string().trim().min(1), valor: z.string() }).strict())
      .optional(),
    criadoDe: iso.optional(),
    criadoAte: iso.optional(),
  })
  .strict();

const filtroPessoaSchema = z
  .object({
    tags: z.array(z.string().trim().min(1)).optional(),
    criadoDe: iso.optional(),
    criadoAte: iso.optional(),
  })
  .strict();

export type FiltroLead = z.infer<typeof filtroLeadSchema>;
export type FiltroPessoa = z.infer<typeof filtroPessoaSchema>;

export type SegmentoAlvo = 'LEAD' | 'PESSOA';

export type FiltroValidado =
  | { alvo: 'LEAD'; filtro: FiltroLead }
  | { alvo: 'PESSOA'; filtro: FiltroPessoa };

export type ResultadoValidarFiltro =
  | { ok: true; valor: FiltroValidado }
  | { ok: false; erro: string };

/** Esquema **fechado** por `alvo` — chave fora do conjunto (ou de outro `alvo`) → erro. */
export function validarFiltro(alvo: SegmentoAlvo, filtroBruto: unknown): ResultadoValidarFiltro {
  const schema = alvo === 'LEAD' ? filtroLeadSchema : filtroPessoaSchema;
  const r = schema.safeParse(filtroBruto ?? {});
  if (!r.success) {
    const erro = r.error.issues
      .map((i) => `${i.path.join('.') || '_'}: ${i.message}`)
      .join('; ');
    return { ok: false, erro };
  }
  return alvo === 'LEAD'
    ? { ok: true, valor: { alvo: 'LEAD', filtro: r.data as FiltroLead } }
    : { ok: true, valor: { alvo: 'PESSOA', filtro: r.data as FiltroPessoa } };
}

/** Condição Prisma-like (`{ AND: [...] }`) — só monta, nunca executa. */
export function construirWhere(valido: FiltroValidado): Record<string, unknown> {
  return valido.alvo === 'LEAD'
    ? construirWhereLead(valido.filtro)
    : construirWherePessoa(valido.filtro);
}

function construirWhereLead(filtro: FiltroLead): Record<string, unknown> {
  const and: Record<string, unknown>[] = [];
  if (filtro.estagio?.length) and.push({ estagio: { in: filtro.estagio } });
  if (filtro.status?.length) and.push({ status: { in: filtro.status } });
  if (filtro.origem?.length) and.push({ origem: { in: filtro.origem } });
  if (filtro.tags?.length) {
    and.push({ tagAssociacoes: { some: { tag: { slug: { in: filtro.tags } } } } });
  }
  if (filtro.responsavelId?.length) and.push({ responsavelId: { in: filtro.responsavelId } });
  for (const { chave, valor } of filtro.campoPersonalizado ?? []) {
    and.push({ valores: { some: { definicao: { chave }, valor } } });
  }
  if (filtro.criadoDe) and.push({ criadoEm: { gte: new Date(filtro.criadoDe) } });
  if (filtro.criadoAte) and.push({ criadoEm: { lte: new Date(filtro.criadoAte) } });
  return and.length ? { AND: and } : {};
}

function construirWherePessoa(filtro: FiltroPessoa): Record<string, unknown> {
  const and: Record<string, unknown>[] = [];
  if (filtro.tags?.length) {
    and.push({ tagAssociacoes: { some: { tag: { slug: { in: filtro.tags } } } } });
  }
  if (filtro.criadoDe) and.push({ criadoEm: { gte: new Date(filtro.criadoDe) } });
  if (filtro.criadoAte) and.push({ criadoEm: { lte: new Date(filtro.criadoAte) } });
  return and.length ? { AND: and } : {};
}
