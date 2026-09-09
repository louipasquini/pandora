# Phase 1 — Data Model: 016-crm-tarefas

## Enums

```prisma
enum TarefaStatus {
  PENDENTE
  EM_ANDAMENTO
  CONCLUIDA
  CANCELADA
}
```

Transições válidas (`domain/tarefa/transicao-status.ts`, pura): `PENDENTE ⇄
EM_ANDAMENTO`; `PENDENTE|EM_ANDAMENTO → CONCLUIDA`; `PENDENTE|EM_ANDAMENTO → CANCELADA`;
`CONCLUIDA → PENDENTE` (reabrir, único caminho de saída de um estado terminal); `CANCELADA
→ *` sempre 409 (estado terminal sem reabertura — cancelar é definitivo, D-10). Concluir
com dependência pendente → 409 (FR-004, checado antes da transição).

## `tarefa`

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `id` | `UUID` PK | UUID v7 na app |
| `titulo` | `TEXT` | obrigatório |
| `descricao` | `TEXT?` | opcional |
| `status` | `TarefaStatus` | default `PENDENTE` |
| `data_vencimento` | `TIMESTAMPTZ?` | opcional — prazo (D-01/agenda) |
| `concluido_em` | `TIMESTAMPTZ?` | preenchido só na transição para `CONCLUIDA`; limpo ao reabrir |
| `pessoa_id` | `UUID?` | FK `pessoa.id`, `onDelete: Restrict` — âncora independente (D-01) |
| `lead_id` | `UUID?` | FK `lead.id`, `onDelete: Restrict` — âncora independente (D-01), usada pela geração automática via Lead (CL-03) |
| `oportunidade_id` | `UUID?` | FK `oportunidade.id`, `onDelete: Restrict` — âncora independente (D-01) |
| `responsavel_id` | `UUID?` | FK `usuario.id`, `onDelete: SetNull`; `null` = tarefa "geral" (D-07) |
| `criado_por_id` | `UUID?` | FK `usuario.id`, `onDelete: SetNull`; `null` quando criada pelo Workflow (ator `sistema:workflow`, mesmo padrão da 014) |
| `origem` | `TEXT` | `'manual'` \| `workflow:<fluxoVersaoId>` — rastreio de quem/o quê criou (mesmo padrão de `canalOrigem` da 009), default `'manual'` |
| `criado_em`/`atualizado_em` | `TIMESTAMPTZ` | padrão |

**Invariantes**: sem `DELETE` físico (D-10) — encerramento é `status = CANCELADA`.
Índices `(responsavelId, status)`, `(pessoaId)`, `(leadId)`, `(oportunidadeId)`,
`(dataVencimento)`.

## `tarefa_checklist_item`

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `id` | `UUID` PK | UUID v7 |
| `tarefa_id` | `UUID` | FK `tarefa.id`, `onDelete: Cascade` |
| `texto` | `TEXT` | obrigatório |
| `concluido` | `BOOLEAN` | default `false` |
| `ordem` | `INT` | posição na lista |
| `criado_em`/`atualizado_em` | `TIMESTAMPTZ` | padrão |

**Invariantes**: `@@unique([tarefaId, ordem])`. Progresso (`x/y`) **derivado** por
contagem (`domain` não persiste). Escrita bloqueada se a tarefa estiver `CONCLUIDA`\|
`CANCELADA` (FR-002/edge case) — 409.

## `tarefa_cronometro_periodo`

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `id` | `UUID` PK | UUID v7 |
| `tarefa_id` | `UUID` | FK `tarefa.id`, `onDelete: Cascade` |
| `inicio` | `TIMESTAMPTZ` | obrigatório |
| `fim` | `TIMESTAMPTZ?` | `null` = período aberto |
| `criado_em` | `TIMESTAMPTZ` | padrão |

**Invariantes**: índice único **parcial** `(tarefaId) WHERE fim IS NULL` — no máximo 1
período aberto por tarefa (D-04; via SQL bruto na migration, Prisma não modela índice
parcial, mesmo padrão 007/009/012). Tempo total **derivado**: soma de `fim - inicio` dos
períodos fechados + (`agoraUtc() - inicio` do período aberto, se houver).

## `tarefa_nota`

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `id` | `UUID` PK | UUID v7 |
| `tarefa_id` | `UUID` | FK `tarefa.id`, `onDelete: Cascade` |
| `autor_id` | `UUID?` | FK `usuario.id`, `onDelete: SetNull`; `null` quando o Workflow comenta (não usado hoje, reservado) |
| `conteudo` | `TEXT` | obrigatório |
| `criado_em` | `TIMESTAMPTZ` | padrão |

**Invariantes**: **append-only** — sem `PATCH`/`DELETE` em nenhum caso (D-02; distinto da
`interacao.NOTA` da 009, que é editável). Índice `(tarefaId, criadoEm)`.

## `tarefa_dependencia`

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `id` | `UUID` PK | UUID v7 |
| `tarefa_id` | `UUID` | FK `tarefa.id`, `onDelete: Cascade` — a tarefa que depende |
| `depende_de_id` | `UUID` | FK `tarefa.id`, `onDelete: Cascade` — a tarefa da qual depende |
| `criado_em` | `TIMESTAMPTZ` | padrão |

**Invariantes**: `@@unique([tarefaId, dependeDeId])`. `tarefaId == dependeDeId` rejeitado
na aplicação (422, auto-dependência). Ciclo (direto ou indireto) rejeitado na aplicação via
`detectarCiclo` (research.md D-R5) — 422. `CHECK (tarefa_id <> depende_de_id)` também no
banco, defensivo (SQL bruto na migration).

## `tarefa_delegacao`

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `id` | `UUID` PK | UUID v7 |
| `tarefa_id` | `UUID` | FK `tarefa.id`, `onDelete: Cascade` |
| `de_responsavel_id` | `UUID?` | FK `usuario.id`, `onDelete: SetNull`; `null` = vinha "geral" |
| `para_responsavel_id` | `UUID?` | FK `usuario.id`, `onDelete: SetNull`; `null` = virou "geral" |
| `autor_id` | `UUID?` | FK `usuario.id`, `onDelete: SetNull` — quem delegou |
| `motivo` | `TEXT?` | opcional |
| `criado_em` | `TIMESTAMPTZ` | padrão |

**Invariantes**: **append-only**, histórico de 1ª classe (D-06) — não é o audit genérico,
mesmo precedente de `oportunidade_movimentacao` (010) e `transferencia_atendimento` (012).
Índice `(tarefaId, criadoEm)`.

## `crm_tarefa_audit`

Forma canônica do core (`montarRegistroAuditoria`, `origem = AJUSTE_MANUAL`,
**append-only**, só delta real) — espelha `CrmPipelineAuditService` (010) campo a campo:
`id`, `autor`, `quando`, `entidade`, `entidade_id`, `campo`, `valor_anterior` (jsonb),
`valor_novo` (jsonb), `motivo`. Cobre criação/edição de título-descrição-prazo-âncoras e
mudança de `status` (FR-015) — delegação **não** duplica aqui (é `tarefa_delegacao`, 1ª
classe, mesmo racional de `oportunidade_movimentacao` não estar em `crm_pipeline_audit`).

## Extensão ao domínio do Workflow (spec 014, sem migração nova nesse ponto)

`backend/src/crm/domain/workflow/tipos.ts`:

```ts
export const ACAO_TIPOS = [
  'MOVER_LEAD_ESTAGIO',
  'APLICAR_TAG',
  'REMOVER_TAG',
  'REGISTRAR_NOTA',
  'MOVER_OPORTUNIDADE_ETAPA',
  'CRIAR_TAREFA', // spec 016
] as const;

export interface AcaoCriarTarefa {
  tipo: 'CRIAR_TAREFA';
  titulo: string;
  descricao?: string;
  prazoDias?: number; // relativo à data de execução da ação; ausente = sem prazo
  responsavelId?: string; // fixo; ausente = tarefa "geral" (D-07)
}
```

`acaoFluxoSchema` (zod, discriminated union) ganha o branch correspondente. `AcaoFluxo`
vira uma união de 6 tipos. `ExecutarAcaoService.executar(acao, registroId, fluxoVersaoId,
registroTipo)` ganha o 4º parâmetro (repassado pelo `WorkerService`, que já o calcula via
`registroTipoDoGatilho`) e um `case 'CRIAR_TAREFA'` que chama `TarefaService.criar` com
`leadId = registroTipo === 'LEAD' ? registroId : undefined` /
`oportunidadeId = registroTipo === 'OPORTUNIDADE' ? registroId : undefined`,
`origem: 'workflow:<fluxoVersaoId>'`, `criadoPorId: null`.

## RBAC — catálogo estendido (spec 004)

Novo recurso `tarefa`:

| id | rótulo |
| --- | --- |
| `tarefa:criar` | Criar tarefas |
| `tarefa:editar` | Editar tarefas (título, descrição, prazo, âncoras, status, checklist, cronômetro, comentários, dependências) |
| `tarefa:ver_todas` | Ver todas as tarefas |
| `tarefa:ver_proprias` | Ver apenas as próprias tarefas e as tarefas gerais (sem responsável) |
| `tarefa:delegar` | Delegar/reatribuir tarefas |

`administrador` e a credencial de serviço concedem as 5 de graça (mesmo padrão de toda
extensão anterior do catálogo) — **0 migração de dados/seed**.

## Endpoints (visão geral — detalhe em `contracts/tarefas.md`)

`/crm/tarefas/**` (~19), `/crm/pessoas/{id}/tarefas` (1, leitura), `/crm/tarefas/ranking`
(1) — **~21 endpoints**, **0 endpoint público novo**.
