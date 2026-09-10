# Phase 1 — Data Model: 017-crm-dashboard

**2 tabelas de negócio novas** (`meta_comercial`, `dashboard_visao`) + **1 tabela de
auditoria** (`crm_dashboard_audit`) + **1 enum** (`MetaComercialPeriodo`). Nenhuma tabela de
métrica materializada / rollup (Princípio V — SC-003). Migração Prisma:
`<timestamp>_crm_dashboard`.

## Catálogos no código (não são tabela)

### `PAINEIS_DASHBOARD` — `backend/src/crm/domain/dashboard/paineis.ts`

`Object.freeze` de `{ id, titulo, formato, permissao }`. `assertCatalogoPaineisCoerente()`
roda no boot do `CrmModule`.

| `id` | `formato` | `permissao` exigida (além de `dashboard:ver`) |
| --- | --- | --- |
| `visao_geral` | `numero` | — (só `dashboard:ver`) |
| `funil_pipeline` | `funil` | `oportunidade:ver_todas` \| `oportunidade:ver_proprias` |
| `ranking_comercial` | `ranking` | `oportunidade:ver_todas` |
| `qualidade_atendimento` | `numero` | `atendimento:ver_todos` \| `atendimento:ver_proprios` |
| `leads_por_origem` | `tabela` | `lead:ver_todos` \| `lead:ver_proprios` |
| `serie_oportunidades` | `serie_temporal` | `oportunidade:ver_todas` \| `oportunidade:ver_proprias` |

`formato ∈ {serie_temporal, funil, ranking, tabela, numero}`. `?formato=csv` só vale para
`tabela` e `ranking` (FR-014).

### `METRICAS_META` — `backend/src/crm/domain/dashboard/meta.ts`

`Object.freeze` de `{ id, rotulo, monetaria }`. Alvo de uma `meta_comercial` referencia um
`id` daqui.

| `id` | `monetaria` | fonte da derivação (`realizado`) |
| --- | --- | --- |
| `oportunidades_ganhas` | `false` | `count` de `oportunidade` que entrou em etapa `GANHA` no período |
| `valor_ganho` | `true` | soma de `valor_estimado_int` das ganhas, **por moeda** (a meta fixa `alvo_moeda`) |
| `leads_novos` | `false` | `count` de `lead` com `criado_em` no período |
| `tarefas_concluidas` | `false` | `count` de `tarefa` com `concluido_em` no período |
| `atendimentos_encerrados` | `false` | `count` de `atendimento` com `encerrado_em` no período |

## Enum

```prisma
enum MetaComercialPeriodo {
  MES
  TRIMESTRE
}
```

`inicio`/`fim` do período de uma meta são **derivados** de `(periodo, referencia)` na
leitura (`America/Sao_Paulo`), nunca colunas (D-R7).

## `meta_comercial`

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `id` | `UUID` PK | UUID v7 na app |
| `metrica` | `TEXT` | um `id` de `METRICAS_META`; fora do catálogo → 422 |
| `periodo` | `MetaComercialPeriodo` | `MES` \| `TRIMESTRE` |
| `referencia` | `DATE` | 1º dia do mês/trimestre de referência (normalizado na escrita) |
| `alvo_int` | `BIGINT` | alvo numérico. Para métrica monetária: `Dinheiro` ×10000 (Padrão Transversal). Para contagem: o número inteiro (×1, sem escala) |
| `alvo_moeda` | `CHAR(3)?` | obrigatório sse `metrica.monetaria`, proibido caso contrário (422) |
| `equipe_id` | `UUID?` | FK `equipe.id`, `onDelete: Cascade` — escopo opcional (D-04) |
| `responsavel_id` | `UUID?` | FK `usuario.id`, `onDelete: Cascade` — escopo opcional; usuário inexistente → 422 (FR US4-4) |
| `descricao` | `TEXT?` | livre |
| `criado_por_id` | `UUID?` | FK `usuario.id`, `onDelete: SetNull` — resolvido de `sub` do JWT (credencial de serviço → `null`, mesmo padrão de `resolverUsuarioIdOuNulo`/016) |
| `criado_em`/`atualizado_em` | `TIMESTAMPTZ` | padrão |

**Invariantes**: `DELETE` físico permitido (D-06 — configuração de baixo valor histórico,
como `feriado`/007); toda escrita audita em `crm_dashboard_audit`. **Sem** unicidade em
`(metrica, periodo, referencia, equipe_id, responsavel_id)` — duas metas para o mesmo
recorte são permitidas (edge case do spec — evita bloquear ajuste no meio do período).
Índices: `(periodo, referencia)`, `(equipe_id)`, `(responsavel_id)`.

O **atingimento** (`realizado`, `percentual`, `status`, `noRitmo`) **nunca** é coluna — é
`statusMeta(realizado, alvo, { inicio, fim }, agora)` puro sobre a query da métrica (FR-011,
CL-02).

## `dashboard_visao`

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `id` | `UUID` PK | UUID v7 na app |
| `nome` | `TEXT` | obrigatório |
| `filtros` | `JSONB` | validado por zod fechado: `{ periodo: {tipo:'relativo', dias:number} \| {tipo:'absoluto', de:string, ate:string}, equipeId?, responsavelId?, pipelineId? }` |
| `paineis` | `JSONB` | `string[]` — ids de `PAINEIS_DASHBOARD` em ordem; ids desconhecidos ignorados ao reidratar (edge case) |
| `dono_usuario_id` | `UUID` | FK `usuario.id`, `onDelete: Cascade` — sempre presente; resolvido de `sub`. Credencial de serviço **não** pode criar visão (não é `Usuario` real) → 400 |
| `perfil_compartilhado_id` | `UUID?` | FK `perfil.id`, `onDelete: SetNull` — quando setado, visão é somente-leitura + clonável para os demais do perfil (D-07) |
| `criado_em`/`atualizado_em` | `TIMESTAMPTZ` | padrão |

**Invariantes**: só o `dono_usuario_id` edita/exclui (403 para os demais, mesmo
compartilhada); compartilhar/descompartilhar é do dono. `DELETE` físico permitido (é
preferência de UI). Toda escrita audita em `crm_dashboard_audit`. Índices:
`(dono_usuario_id)`, `(perfil_compartilhado_id)`.

## `crm_dashboard_audit`

Forma canônica do core (`montarRegistroAuditoria`, `origem = 'AJUSTE_MANUAL'`),
**append-only** (a aplicação nunca faz `UPDATE`/`DELETE`), **só delta real** (`PATCH` no-op
→ 0 linha). Espelha `crm_tarefa_audit` (016) / `crm_pipeline_audit` (010) **coluna a coluna**
— uma linha por campo alterado.

| Coluna | Tipo |
| --- | --- |
| `id` | `UUID` PK (UUID v7) |
| `autor` | `TEXT` — `sub` do JWT |
| `quando` | `TIMESTAMPTZ` |
| `entidade` | `TEXT` — `'meta_comercial'` \| `'dashboard_visao'` |
| `entidade_id` | `UUID` |
| `campo` | `TEXT` — nome do campo alterado (ou `'*'` em criar/remover) |
| `valor_anterior` | `JSONB?` |
| `valor_novo` | `JSONB?` |
| `motivo` | `TEXT` — `'criar'` \| `'atualizar'` \| `'remover'` |
| `origem` | `TEXT` — sempre `'AJUSTE_MANUAL'` |
| `criado_em` | `TIMESTAMPTZ` |

## Relações novas no `schema.prisma`

- `Usuario` ganha back-relations: `metasComerciaisCriadas MetaComercial[]`,
  `dashboardVisoes DashboardVisao[]` (dono).
- `Equipe` ganha `metasComerciais MetaComercial[]`.
- `Perfil` ganha `dashboardVisoesCompartilhadas DashboardVisao[]`.

Nenhuma FK nova para `Pessoa`/`Lead`/`Oportunidade` — o dashboard só **lê** essas tabelas
via queries agregadas, nunca as referencia por FK.

## RBAC — catálogo (`backend/src/auth/rbac/catalogo.ts`)

**+2 permissões**, recurso novo `dashboard`:

| `id` | `rotulo` |
| --- | --- |
| `dashboard:ver` | Ver o dashboard do CRM e seus painéis |
| `dashboard:gerir_metas` | Criar, editar e remover metas comerciais |

`administrador` + credencial de serviço concedem de graça (special-case já existente no
`SujeitoRbacService` — **0 migração de dados / seed**). Painéis específicos reusam as
permissões já existentes do recurso que expõem (tabela de `PAINEIS_DASHBOARD` acima).
