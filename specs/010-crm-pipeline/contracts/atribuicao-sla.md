# Contrato — Atribuição automática, SLA e "esfriando"

## `PUT /crm/pipelines/{id}/atribuicao`

Guard: `crm_admin:gerir_pipelines`. Body:
```json
{
  "modoAtribuicao": "MANUAL|RODIZIO|REGRA",
  "atribuicaoFallback": "null|RODIZIO",
  "regras": [
    { "ordem": 0, "campo": "ORIGEM", "valor": { "igual": "instagram" }, "responsavelId": "uuid" },
    { "ordem": 1, "campo": "VALOR_ESTIMADO_MINIMO", "valor": { "minimoInt": "500000000", "moeda": "BRL" }, "responsavelId": "uuid" }
  ]
}
```
Substitui a lista completa de `regra_atribuicao_pipeline` numa transação (apaga + recria).
`responsavelId` de usuário inexistente → 422. `modoAtribuicao: RODIZIO`/`REGRA` sem
`equipeId` no pipeline (necessário como pool do round robin, direto ou como fallback) → 422.

## `GET /crm/pipelines/{id}/atribuicao`

Mesmo guard de leitura de pipeline. Retorna `modoAtribuicao`, `atribuicaoFallback`,
`regras` ordenadas.

## Resolução de responsável na criação (FR-013–FR-016)

Ordem de decisão em `POST /crm/oportunidades`:
1. `responsavelId` explícito no body → usa e para (nenhuma regra roda).
2. `modoAtribuicao = MANUAL` → sem responsável.
3. `modoAtribuicao = REGRA` → avalia `regra_atribuicao_pipeline` em ordem crescente de
   `ordem`; 1ª que casa (`ORIGEM.igual` compara com `lead.origem`, `null` se âncora é
   pessoa; `VALOR_ESTIMADO_MINIMO.minimoInt` compara `valorEstimado.valorInt` na mesma
   moeda — moeda diferente nunca casa) define o responsável; sem match, aplica
   `atribuicaoFallback` (se `RODIZIO`, passo 4; se `null`, sem responsável).
4. `modoAtribuicao = RODIZIO` (ou fallback resolvido para `RODIZIO`) → `escolherResponsavel`
   (domain puro) recebe os membros **ativos** de `pipeline.equipeId` (spec 007, ordenados
   por `entrouEm`) e `pipeline.ultimoAtribuidoUsuarioId`; devolve o próximo da lista (ou o
   1º, se o cursor não está mais entre os ativos); sem membro ativo → sem responsável
   (nunca erro, FR-014 Acceptance 3). O service persiste o novo cursor na mesma transação.

## Campos derivados de leitura (FR-017–FR-019)

`GET`/lista de `oportunidade` inclui:
- `slaEstourado: boolean` — `calcularSlaEstourado(etapaAtual.slaHoras, entrouEtapaEm, agora)`,
  sempre `false` se `slaHoras` é `null`.
- `esfriando: boolean` — `calcularEsfriando(pipeline.diasEsfriando, ultimaInteracao ??
  oportunidade.criadoEm, agora)`, sempre `false` se `diasEsfriando` é `null`.
  `ultimaInteracao` = `MAX(interacao.ocorridoEm)` da âncora da oportunidade (spec 009), sem
  gravar coluna nova em `interacao` nem em `oportunidade`.

`GET /crm/oportunidades?slaEstourado=true&esfriando=true` filtra em memória/`having`-like
sobre os campos derivados após aplicar o escopo de visão e os demais filtros de `where` —
nunca amplia o que o sujeito já vê.
