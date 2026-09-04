# Contrato — Segmento (query salva, CL-03)

## CRUD

- `POST`/`PATCH`/`DELETE /crm/segmentos` — `segmento:gerir`. `POST`/`PATCH` validam
  `filtro` contra o esquema fechado do `alvo` (`validarFiltro` — `data-model.md`); chave
  fora do conjunto, ou de outro `alvo` → 422. `DELETE` é físico (sem dependentes nesta
  fase). Auditam em `crm_interacao_audit`; corpo idêntico → no-op (0 audit).
- `GET /crm/segmentos`, `GET /crm/segmentos/{id}` — `segmento:ver`.

## `GET /crm/segmentos/{id}/membros`

Guard: `segmento:ver`. Pipeline:

1. Carrega o `segmento` (404 se não existe).
2. `construirWhere(alvo, filtro)` — puro, monta a condição.
3. Combina com o `where` de escopo de visão do sujeito:
   - `alvo = LEAD`: mesmo `where` que `LeadConsultaService.listar` já aplica
     (`lead:ver_todos` → tudo; `lead:ver_proprios` → só `responsavelId = sujeito`).
   - `alvo = PESSOA`: exige `pessoa:ver` no sujeito (sem escopo fino adicional — a 005 não
     tem `ver_proprios` para pessoa).
4. Executa `prisma.lead.findMany`/`prisma.pessoa.findMany` com `AND: [whereFiltro,
   whereEscopo]`, paginado.

**Nunca** materializado — cada chamada recalcula (regra 8.2.2). Um sujeito com
`lead:ver_proprios` chamando o segmento de outro time só vê a interseção com a própria
carteira — o segmento não amplia o escopo, só restringe mais.

## Exemplo de filtro (`alvo = LEAD`)

```json
{
  "estagio": ["QUALIFICADO", "NUTRICAO"],
  "tags": ["webinar-out"],
  "criadoDe": "2026-09-01T00:00:00Z"
}
```

`construirWhere` traduz para:

```ts
{
  estagio: { in: ['QUALIFICADO', 'NUTRICAO'] },
  tagAssociacoes: { some: { tag: { slug: { in: ['webinar-out'] } } } },
  criadoEm: { gte: new Date('2026-09-01T00:00:00Z') },
}
```
