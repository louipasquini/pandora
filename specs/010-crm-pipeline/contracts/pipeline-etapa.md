# Contrato — Pipeline e etapa

## `POST /crm/pipelines`

Guard: `@RequerPermissao('crm_admin:gerir_pipelines')`.

Body: `{ nome, descricao?, equipeId?, modoAtribuicao?: MANUAL|RODIZIO|REGRA, diasEsfriando?, atribuicaoFallback?: null|RODIZIO }`.
`modoAtribuicao = RODIZIO` sem `equipeId` → 422. Resposta `201`, `ativo: true`, sem etapa.

## `GET /crm/pipelines` / `GET /crm/pipelines/{id}`

Guard: `oportunidade:ver_todas` **ou** `oportunidade:ver_proprias` (`@AutenticadoBasta()` +
checagem no service — leitura de configuração não é restrita como a de oportunidade).

## `PATCH /crm/pipelines/{id}`

Guard: `crm_admin:gerir_pipelines`. Mesmos campos do `POST` + `ativo`. Auditado em
`crm_pipeline_audit`. **Sem `DELETE`.**

## `POST /crm/pipelines/{id}/etapas`

Guard: `crm_admin:gerir_pipelines`. Body: `{ nome, ordem, tipo: ABERTA|GANHA|PERDIDA, slaHoras? }`.
`ordem` duplicada no mesmo pipeline → 422 (`@@unique`).

## `GET /crm/pipelines/{id}/etapas`

Mesmo guard de leitura de pipeline. Lista ordenada por `ordem`.

## `PATCH /crm/pipelines/{id}/etapas/{etapaId}`

Guard: `crm_admin:gerir_pipelines`. Campos: `nome`, `ordem`, `slaHoras`. **`tipo` não é
editável** após criação se a etapa já tem alguma `oportunidade`/`oportunidade_movimentacao`
(422) — evita reclassificar retroativamente um histórico de ganho/perda; sem uso, `tipo`
pode mudar livremente.

## `DELETE /crm/pipelines/{id}/etapas/{etapaId}`

Guard: `crm_admin:gerir_pipelines`. Físico. 409 se a etapa tem qualquer `oportunidade`
(atual) ou `oportunidade_movimentacao` (`etapaAnteriorId`/`etapaNovaId`) referenciando-a.

## Regra de prontidão do pipeline (FR-005)

`POST /crm/oportunidades` valida, antes de criar, que o `pipelineId` referenciado tem
**≥1** `etapa_pipeline` de `tipo = ABERTA`; senão 422 (`pipeline_sem_etapa_aberta`).
