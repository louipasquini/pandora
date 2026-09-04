# Phase 1 — Data Model: 010-crm-pipeline

## Enums

```prisma
enum EtapaPipelineTipo {
  ABERTA
  GANHA
  PERDIDA
}

enum ModoAtribuicao {
  MANUAL
  RODIZIO
  REGRA
}

enum RegraAtribuicaoCampo {
  ORIGEM
  VALOR_ESTIMADO_MINIMO
}
```

`CampoPersonalizadoTipo` (`TEXTO`\|`NUMERO`\|`BOOLEANO`\|`DATA`\|`SELECAO`) é **reusado** do
enum já existente da spec 008 — sem duplicar.

## `pipeline`

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `id` | `UUID` PK | UUID v7 na app |
| `nome` | `TEXT` | obrigatório |
| `descricao` | `TEXT?` | opcional |
| `equipe_id` | `UUID?` | FK `equipe.id` (007), `onDelete: Restrict`; obrigatório na prática quando `modo_atribuicao = RODIZIO` (validado na aplicação, não `CHECK`, para permitir configurar `equipe_id` antes de trocar o modo) |
| `modo_atribuicao` | `ModoAtribuicao` | default `MANUAL` |
| `dias_esfriando` | `INT?` | `null` desativa o alerta; se presente, `> 0` |
| `ultimo_atribuido_usuario_id` | `UUID?` | FK `usuario.id`, `onDelete: SetNull`; cursor de round robin (ver `research.md`) — estado de rotação, não métrica |
| `ativo` | `BOOLEAN` | default `true` |
| `criado_em`/`atualizado_em` | `TIMESTAMPTZ` | padrão |

**Invariantes**: sem `DELETE` físico (mesmo padrão `equipe`/`integracao` da 007) — só
`ativo=false`. Índice `(ativo)`.

## `etapa_pipeline`

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `id` | `UUID` PK | UUID v7 |
| `pipeline_id` | `UUID` | FK `pipeline.id`, `onDelete: Cascade` (etapa não existe sem o pipeline; pipeline não tem `DELETE` físico, então na prática nunca dispara — defensivo, mesmo raciocínio do `Cascade` da 009 em `tag_associacao`) |
| `nome` | `TEXT` | obrigatório |
| `ordem` | `INT` | único por pipeline |
| `tipo` | `EtapaPipelineTipo` | obrigatório |
| `sla_horas` | `INT?` | `null` = sem SLA; se presente, `> 0` |
| `criado_em`/`atualizado_em` | `TIMESTAMPTZ` | padrão |

**Invariantes**: `@@unique([pipelineId, ordem])`. `DELETE` físico só permitido (na
aplicação) se **nenhuma** `oportunidade` (atual) nem `oportunidade_movimentacao`
(histórica, `etapaAnteriorId` ou `etapaNovaId`) referencia a etapa — senão 409 (FR-004).
Índice `(pipelineId, tipo)`.

## `oportunidade`

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `id` | `UUID` PK | UUID v7 |
| `pipeline_id` | `UUID` | FK `pipeline.id`, `onDelete: Restrict` |
| `etapa_id` | `UUID` | FK `etapa_pipeline.id`, `onDelete: Restrict` — etapa **atual** (view da última movimentação, nunca a única fonte — reconstruível de `oportunidade_movimentacao`) |
| `pessoa_id` | `UUID?` | FK `pessoa.id`, `onDelete: Restrict` |
| `lead_id` | `UUID?` | FK `lead.id`, `onDelete: Restrict` |
| `titulo` | `TEXT` | obrigatório |
| `valor_estimado_int` | `BIGINT` | escala ×10000 (core `Dinheiro`) |
| `valor_estimado_moeda` | `CHAR(3)` | ISO 4217, nunca opcional |
| `responsavel_id` | `UUID?` | FK `usuario.id`, `onDelete: Restrict` |
| `data_prevista_fechamento` | `DATE?` | opcional |
| `entrou_etapa_em` | `TIMESTAMPTZ` | atualizado a cada `mover` |
| `criado_em`/`atualizado_em` | `TIMESTAMPTZ` | padrão |

**Invariantes**:
- `CHECK (num_nonnulls(pessoa_id, lead_id) = 1)` — âncora exclusiva (D-01, mesmo padrão da
  `interacao` na 009).
- Sem `DELETE` físico — perdida é o estado terminal (FR-011).
- Índices: `(pipelineId, etapaId)`, `(responsavelId)`, `(pessoaId)`, `(leadId)`.

**Timeline "oportunidades de uma pessoa"** (não é coluna, é a query — mesmo padrão CL-01 da
009):
```sql
SELECT * FROM oportunidade o
LEFT JOIN lead l ON o.lead_id = l.id
WHERE o.pessoa_id = :pessoaId OR l.pessoa_id = :pessoaId
ORDER BY o.criado_em DESC;
```

**Campos derivados na leitura (não persistidos)**:
- `slaEstourado = etapaAtual.slaHoras IS NOT NULL AND (agora - entrouEtapaEm) > slaHoras`.
- `esfriando = pipeline.diasEsfriando IS NOT NULL AND (agora - ultimaInteracaoOuCriacao) > diasEsfriando`
  (`ultimaInteracaoOuCriacao` = `MAX(interacao.ocorridoEm)` da âncora, ou `oportunidade.criadoEm`
  se não há nenhuma).
- `status` (rótulo de leitura) = `etapaAtual.tipo` (`ABERTA`\|`GANHA`\|`PERDIDA`).

## `oportunidade_movimentacao`

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `id` | `UUID` PK | UUID v7 |
| `oportunidade_id` | `UUID` | FK `oportunidade.id`, `onDelete: Cascade` |
| `etapa_anterior_id` | `UUID?` | FK `etapa_pipeline.id`, `onDelete: Restrict`; `null` só na 1ª linha (criação) |
| `etapa_nova_id` | `UUID` | FK `etapa_pipeline.id`, `onDelete: Restrict` |
| `movido_por_id` | `UUID?` | FK `usuario.id`, `onDelete: Restrict`; `null` quando a porta `PortaObservacaoPagamentoCrm` move automaticamente, ou quando o sujeito é a credencial de serviço |
| `motivo` | `TEXT?` | obrigatório sse `etapaNova.tipo = PERDIDA` (validado na aplicação — o `tipo` da etapa não está disponível para um `CHECK` simples sem subquery; reforçado no service) |
| `criado_em` | `TIMESTAMPTZ` | padrão — é o próprio "quando" |

**Invariantes**: append-only — sem `PATCH`/`DELETE` (histórico de 1ª classe, fonte de SLA/
métricas/timeline de movimentação). Índice `(oportunidadeId, criadoEm)`.

## `regra_atribuicao_pipeline`

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `id` | `UUID` PK | UUID v7 |
| `pipeline_id` | `UUID` | FK `pipeline.id`, `onDelete: Cascade` |
| `ordem` | `INT` | único por pipeline; avaliação em ordem crescente |
| `campo` | `RegraAtribuicaoCampo` | `ORIGEM` \| `VALOR_ESTIMADO_MINIMO` |
| `valor` | `JSONB` | `{ igual: string }` se `ORIGEM`; `{ minimoInt: string, moeda: string }` (Dinheiro serializado) se `VALOR_ESTIMADO_MINIMO` |
| `responsavel_id` | `UUID` | FK `usuario.id`, `onDelete: Restrict` |
| `criado_em`/`atualizado_em` | `TIMESTAMPTZ` | padrão |

**Invariantes**: `@@unique([pipelineId, ordem])`. `PUT /crm/pipelines/{id}/atribuicao`
substitui a lista inteira numa transação (apaga + recria) — mais simples e seguro que
diffing parcial para uma lista pequena e sempre reescrita por completo (D-03/FR-013).
`fallback` (`null`\|`RODIZIO`) vive como coluna em `pipeline` (`atribuicao_fallback
ModoAtribuicao?`), não nesta tabela.

## `campo_personalizado_oportunidade` / `valor_campo_oportunidade`

Mesmo padrão exato de `campo_personalizado_lead`/`valor_campo_lead` (spec 008) — só troca a
FK de `lead_id` para `oportunidade_id`.

| Coluna (`campo_personalizado_oportunidade`) | Tipo | Regras |
| --- | --- | --- |
| `id` | `UUID` PK | UUID v7 |
| `chave` | `TEXT` | único, imutável (slug) |
| `rotulo` | `TEXT` | obrigatório |
| `tipo` | `CampoPersonalizadoTipo` | reusa enum da 008 |
| `opcoes` | `TEXT[]` | default `[]`, obrigatório preencher sse `tipo = SELECAO` |
| `obrigatorio` | `BOOLEAN` | default `false` |
| `ativo` | `BOOLEAN` | default `true` |
| `criado_em`/`atualizado_em` | `TIMESTAMPTZ` | padrão |

| Coluna (`valor_campo_oportunidade`) | Tipo | Regras |
| --- | --- | --- |
| `id` | `UUID` PK | UUID v7 |
| `oportunidade_id` | `UUID` | FK `oportunidade.id`, `onDelete: Cascade` |
| `definicao_id` | `UUID` | FK `campo_personalizado_oportunidade.id`, `onDelete: Restrict` |
| `valor` | `TEXT` | validado por tipo na aplicação (mesma `validarValorCampo` da 008, reusada) |
| `criado_em`/`atualizado_em` | `TIMESTAMPTZ` | padrão |

**Invariantes**: `@@unique([oportunidadeId, definicaoId])`.

## `crm_pipeline_audit`

Forma canônica `RegistroAuditoria` do `core` (idêntica a `crm_lead_audit`/
`crm_interacao_audit`): `id`, `autor`, `quando`, `entidade` (`pipeline`\|`etapa_pipeline`\|
`oportunidade`\|`regra_atribuicao_pipeline`\|`campo_personalizado_oportunidade`),
`entidade_id`, `campo`, `valor_anterior`, `valor_novo`, `motivo`, `origem`
(`AJUSTE_MANUAL`), `criado_em`. Append-only. **Não** recebe linha de mudança de etapa —
`oportunidade_movimentacao` já é o registro de 1ª classe dessa mudança (FR-025).

## `Lead`/`Pessoa`/`Equipe`/`Usuario` (alterados — só relação inversa)

Sem coluna nova. Ganham os campos de relação Prisma exigidos pelas FKs acima:
`Lead.oportunidades Oportunidade[]`, `Pessoa.oportunidades Oportunidade[]`,
`Equipe.pipelines Pipeline[]`, `Usuario.oportunidadesResponsavel Oportunidade[]` (+
relações nomeadas para `movidoPor`, `ultimoAtribuido`, `regrasAtribuicao`).

## Estado de leitura — métricas do pipeline (não é tabela)

`GET /crm/pipelines/{id}/metricas` devolve, sempre recalculado:

```ts
{
  porEtapa: {
    etapaId: string;
    nome: string;
    tipo: 'ABERTA' | 'GANHA' | 'PERDIDA';
    quantidade: number;
    valorEstimado: { valorInt: string; moeda: string }[]; // 1 entrada por moeda presente
    tempoMedioHoras: number | null; // só ABERTA; null sem oportunidade na etapa
  }[];
  taxaConversao: number | null; // ganhas / (ganhas + perdidas); null se denominador 0
}
```

Implementado por `agregarMetricas(linhas)` pura em `domain/pipeline/metricas.ts`, a partir
de um `groupBy` Prisma por `[etapaId, valorEstimadoMoeda]` (contagem + soma) — sem contador
persistido (Princípio V).
