# Contrato — Oportunidade e movimentação

## `POST /crm/oportunidades`

Guard: `@RequerPermissao('oportunidade:criar')`.

Body:
```json
{
  "pipelineId": "uuid",
  "pessoaId": "uuid | omitido",
  "leadId": "uuid | omitido",
  "titulo": "string",
  "valorEstimado": { "valorInt": "string", "moeda": "BRL" },
  "responsavelId": "uuid | omitido",
  "dataPrevistaFechamento": "ISO date | omitido"
}
```

Regras (422): exatamente um de `pessoaId`/`leadId` (D-01); `pipelineId` sem etapa `ABERTA`
(FR-005); `valorEstimado.valorInt` fora do formato inteiro-string aceito por
`Dinheiro.deInteiroEscalado`. Âncora ou pipeline inexistente → 404.

Efeito: nasce na etapa de menor `ordem` entre as `ABERTA`; 1ª `oportunidade_movimentacao`
(`etapaAnteriorId: null`); `responsavelId` resolvido por atribuição automática quando
omitido (ver `atribuicao-sla.md`); `entrouEtapaEm` = agora.

## `GET /crm/oportunidades`

Guard: `@AutenticadoBasta()` — escopo `ver_todas`\|`ver_proprias` aplicado no `where`
(`responsavelId = sujeito` para `ver_proprias`, credencial de serviço = `ver_todas`).
Filtros: `pipelineId`, `etapaId`, `responsavelId`, `slaEstourado`, `esfriando` (E lógico
entre todos), paginação (`page`/`pageSize`, default 25, teto 100).

## `GET /crm/oportunidades/{id}`

Mesmo escopo. Fora do escopo → 404 (nunca revela existência).

## `PATCH /crm/oportunidades/{id}`

Guard: `oportunidade:editar` **e** dentro do escopo de visão do sujeito (mesma regra do
`GET`). Campos: `titulo`, `valorEstimado`, `responsavelId`, `dataPrevistaFechamento`.
**`etapaId`/`pipelineId` no corpo → 422** (mudança de etapa só via `mover`). Auditado em
`crm_pipeline_audit`.

## `POST /crm/oportunidades/{id}/mover`

Guard: `oportunidade:mover` + escopo de visão. Body: `{ etapaId: "uuid", motivo?: "string" }`.

Regras:
- `etapaId` de pipeline diferente do da oportunidade → 422.
- Etapa destino = etapa atual → no-op (200, sem nova movimentação).
- Etapa destino `tipo = PERDIDA` sem `motivo` (string não vazia) → 422.
- Caso contrário: grava `oportunidade_movimentacao` (`etapaAnteriorId` = etapa atual,
  `etapaNovaId` = destino, `movidoPorId` = sujeito ou `null` se credencial de serviço),
  atualiza `etapaId`/`entrouEtapaEm` da oportunidade.
- Reabrir uma oportunidade `PERDIDA`/`GANHA` para uma etapa `ABERTA` do mesmo pipeline é
  permitido, sem exigir motivo.

## `GET /crm/oportunidades/{id}/movimentacoes`

Mesmo escopo do `GET` de oportunidade. Lista completa, ordenada por `criadoEm asc`, nunca
paginada de forma que esconda uma transição (teto alto ou sem paginação — histórico de uma
única oportunidade é pequeno).

## `GET /crm/pessoas/{id}/oportunidades` e `GET /crm/leads/{id}/oportunidades`

Guard: mesma disciplina de âncora da 009 (`pessoa:ver` para o 1º, escopo de `lead:ver_*`
para o 2º). Para pessoa, inclui a união (D-01): oportunidades diretas ∪ oportunidades dos
leads convertidos nela — mesma query-pattern de `interacao` (009), sem re-apontar linha.
