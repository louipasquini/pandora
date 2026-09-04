# Phase 1 — Data Model: 009-crm-interacao-timeline

## Enums

```prisma
enum InteracaoTipo {
  WHATSAPP
  EMAIL
  LIGACAO
  TICKET
  NOTA
  NPS
}

enum InteracaoDirecao {
  ENTRADA
  SAIDA
}

enum SegmentoAlvo {
  LEAD
  PESSOA
}
```

## `interacao`

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `id` | `UUID` PK | UUID v7 na app |
| `pessoa_id` | `UUID?` | FK `pessoa.id`, `onDelete: Restrict` |
| `lead_id` | `UUID?` | FK `lead.id`, `onDelete: Restrict` |
| `tipo` | `InteracaoTipo` | obrigatório |
| `direcao` | `InteracaoDirecao?` | obrigatória se `tipo ∈ {WHATSAPP,EMAIL,LIGACAO,TICKET}`; opcional em `NPS`; proibida em `NOTA` |
| `conteudo` | `TEXT` | obrigatório |
| `nota_nps` | `SMALLINT?` | obrigatório sse `tipo = NPS`; `0..10`; proibido caso contrário |
| `autor_id` | `UUID?` | FK `usuario.id`, `onDelete: Restrict`; nulo se veio de canal externo sem autor interno |
| `canal_origem` | `TEXT?` | chave de idempotência de integração (011/012) |
| `id_externo` | `TEXT?` | idem |
| `ocorrido_em` | `TIMESTAMPTZ` | default = `criado_em` se omitido na criação |
| `editado_em` | `TIMESTAMPTZ?` | só `NOTA` |
| `removido_em` | `TIMESTAMPTZ?` | só `NOTA` (_soft-delete_) |
| `criado_em`/`atualizado_em` | `TIMESTAMPTZ` | padrão |

**Invariantes**:
- `CHECK (num_nonnulls(pessoa_id, lead_id) = 1)` — âncora exclusiva (CL-01).
- `CHECK ((tipo = 'NOTA') OR (removido_em IS NULL AND editado_em IS NULL))` — só `NOTA`
  aceita edição/remoção (CL-05, reforça o que o serviço já impede).
- `@@unique([canalOrigem, idExterno])` **parcial** (`WHERE canal_origem IS NOT NULL AND
  id_externo IS NOT NULL`) — idempotência da porta (FR-011).
- Índices: `(pessoa_id, ocorrido_em)`, `(lead_id, ocorrido_em)`, `(tipo)`.

**Timeline unificada de `pessoa`** (não é coluna, é a query — CL-01):
```sql
SELECT * FROM interacao i
LEFT JOIN lead l ON i.lead_id = l.id
WHERE i.pessoa_id = :pessoaId OR l.pessoa_id = :pessoaId
ORDER BY i.ocorrido_em DESC;
```

## `tag`

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `id` | `UUID` PK | UUID v7 |
| `slug` | `TEXT` | único, gerado por normalização (trim+lowercase+espaço→`-`) |
| `rotulo` | `TEXT` | texto de exibição |
| `cor` | `TEXT?` | opcional |
| `ativo` | `BOOLEAN` | default `true` |
| `criado_em`/`atualizado_em` | `TIMESTAMPTZ` | padrão |

## `tag_associacao`

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `id` | `UUID` PK | UUID v7 |
| `tag_id` | `UUID` | FK `tag.id`, `onDelete: Restrict` |
| `lead_id` | `UUID?` | FK `lead.id`, `onDelete: Cascade` |
| `pessoa_id` | `UUID?` | FK `pessoa.id`, `onDelete: Cascade` |
| `interacao_id` | `UUID?` | FK `interacao.id`, `onDelete: Cascade` |
| `criado_por` | `UUID?` | FK `usuario.id`, `onDelete: Restrict` |
| `criado_em` | `TIMESTAMPTZ` | padrão |

**Invariantes**:
- `CHECK (num_nonnulls(lead_id, pessoa_id, interacao_id) = 1)` — âncora exclusiva (uma das
  três, nunca zero nem duas).
- 3 índices únicos **parciais**: `@@unique([tagId, leadId]) WHERE lead_id IS NOT NULL`,
  idem para `pessoaId`/`interacaoId` — nenhuma tag duplicada na mesma âncora (FR-016).
- `onDelete: Cascade` nas âncoras (ao contrário de `interacao`/`lead`/`pessoa`, que são
  `Restrict`): remover a **associação** quando a âncora some é seguro (a associação não é
  histórico por si, é só um vínculo); a âncora em si nunca é apagada fisicamente nesta spec
  (`lead`/`pessoa` não têm `DELETE`; `interacao` só _soft-delete_ em `NOTA`), então na
  prática o `Cascade` nunca dispara — é defensivo.

## `segmento`

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `id` | `UUID` PK | UUID v7 |
| `nome` | `TEXT` | obrigatório |
| `descricao` | `TEXT?` | opcional |
| `alvo` | `SegmentoAlvo` | `LEAD` \| `PESSOA` |
| `filtro` | `JSONB` | validado por `validarFiltro(alvo, filtro)` — esquema fechado |
| `ativo` | `BOOLEAN` | default `true` |
| `criado_por` | `UUID` | FK `usuario.id`, `onDelete: Restrict` |
| `criado_em`/`atualizado_em` | `TIMESTAMPTZ` | padrão |

**Esquema de `filtro` por `alvo`** (`.strict()` — chave fora do conjunto → 422):

```ts
// alvo = LEAD
{
  estagio?: LeadEstagio[]
  status?: LeadStatus[]
  origem?: string[]
  tags?: string[]              // slugs
  responsavelId?: string[]     // uuid
  campoPersonalizado?: { chave: string; valor: string }[]
  criadoDe?: string            // ISO datetime
  criadoAte?: string
}

// alvo = PESSOA
{
  tags?: string[]               // slugs
  criadoDe?: string
  criadoAte?: string
}
```

`construirWhere(alvo, filtroValidado)` traduz cada chave presente para uma cláusula
`Prisma.LeadWhereInput`/`Prisma.PessoaWhereInput` (ex.: `tags` vira um `some` sobre a relação
implícita `tag_associacao`; `campoPersonalizado` vira `some` sobre `valor_campo_lead`
filtrando por `definicao.chave` + `valor`). Chaves ausentes não entram no `AND` — filtro
vazio (`{}`) retorna todos dentro do escopo de visão do sujeito.

## `crm_interacao_audit`

Forma canônica `RegistroAuditoria` do `core` (idêntica a `crm_lead_audit`/
`crm_admin_audit`): `id`, `autor`, `quando`, `entidade` (`interacao`\|`tag_associacao`\|
`segmento`), `entidade_id`, `campo`, `valor_anterior`, `valor_novo`, `motivo`, `origem`
(`AJUSTE_MANUAL`), `criado_em`. Append-only.

## `Lead` (spec 008, alterado)

- **Removida**: `tags TEXT[]`.
- Sem outra mudança de coluna. Os endpoints `POST`/`DELETE /crm/leads/{id}/tags` mantêm o
  mesmo contrato JSON, agora resolvidos por `TagService` + `tag_associacao(leadId=...)`.

## Estado de leitura — `EstadoTagCatalogo` (não é tabela)

`GET /crm/tags` devolve `{ id, slug, rotulo, cor, ativo, usos: { lead: n, pessoa: n,
interacao: n } }[]` — a contagem é uma `COUNT(*) GROUP BY tipo_ancora`, sempre derivada.
