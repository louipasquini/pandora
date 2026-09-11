# Contrato HTTP: `/contratos`

Todas as rotas exigem JWT de serviço (spec 003) + RBAC (spec 004). Recurso novo `contrato`:
`contrato:ver` (leitura), `contrato:editar` (o único `PATCH`).

## `GET /contratos`

Query (zod, `strip()`, valores inválidos → `400`):

| Campo | Tipo | Nota |
| --- | --- | --- |
| `produtoCodigo` | `string` | código de 3 letras do `Produto` |
| `pessoaId` | `uuid` | |
| `turma` | `string` | casa `turma_numero` (curado ?? derivado) de **qualquer** aditivo do contrato |
| `status` | `ATIVO\|EXPIRADO\|CANCELADO\|DESCONHECIDO` | derivado — computado em SQL (R6 do research.md) |
| `pagina` / `tamanho` | `int` | default 1 / 25, teto 100 |

Resposta:

```json
{
  "itens": [
    {
      "id": "...",
      "pessoa": { "id": "...", "nome": "..." },
      "produto": { "id": "...", "codigo": "PCS" },
      "statusCanonico": "ATIVO",
      "acessoLiberado": true,
      "fimAcesso": "2026-10-01T00:00:00.000Z",
      "ticketTotal": { "BRL": "12345000" },
      "valorRecebido": { "BRL": "12345000" },
      "ajusteManualStatus": null
    }
  ],
  "pagina": 1,
  "tamanho": 25,
  "total": 1
}
```

## `GET /contratos/:id`

Como acima + `toleranciaAtrasoDias`, `contratoAssinado`, `ajusteManual{Status,Em,Autor,
Motivo}`, `criadoEm`/`atualizadoEm`, e:

```json
{
  "aditivos": [
    {
      "id": "...",
      "transacaoId": "...",
      "rotulo": "COMPRA_INICIAL",
      "ocorridoEm": "2026-08-01T00:00:00.000Z",
      "fimAcessoResultante": "2026-09-01T00:00:00.000Z",
      "valorBruto": { "valorInt": "12345000", "moeda": "BRL" },
      "statusCanonicoTransacao": "PAGO",
      "precisaRevisao": false,
      "motivoRevisao": null
    }
  ]
}
```

`404` se o contrato não existir.

## `PATCH /contratos/:id`

Body (zod, `strict()`):

```json
{ "toleranciaAtrasoDias": 3, "contratoAssinado": true, "ajusteManualStatus": "ATIVO", "motivo": "cortesia — liberação manual combinada com o suporte" }
```

- Todos os 3 campos de dado são opcionais individualmente, mas **pelo menos um** deve estar
  presente (corpo vazio → `400`).
- `motivo` é **sempre obrigatório** (Padrão Transversal "Auditoria") — ausente/vazio → `400`.
- `ajusteManualStatus: null` explícito limpa o override manualmente (sem esperar o próximo
  aditivo) — também exige `motivo`.
- Cada campo efetivamente alterado gera 1 linha em `contrato_audit`
  (`montarRegistroAuditoria`, `origem: AJUSTE_MANUAL`) com `autor` = sujeito do JWT.
- Resposta: o contrato atualizado (mesma forma do `GET /:id`).
- `404` se o contrato não existir.

Nenhum `POST`/`DELETE` — `contrato` só nasce/muda pelo pipeline (Princípio VIII, FR-011).
