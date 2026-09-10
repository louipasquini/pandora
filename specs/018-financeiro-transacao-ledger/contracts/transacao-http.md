# Contrato HTTP — `GET /financeiro/transacoes`

Todas as rotas exigem JWT (spec 003) + a permissão **`transacao:ver`** (spec 004). 401 sem
token · 403 autenticado sem permissão (corpo genérico) · nenhuma rota `@Public`/
`@AutenticadoBasta`.

---

## `GET /financeiro/transacoes`

Lista paginada do ledger consolidado das 7 contas.

### Query params

| Param | Tipo | Default | Notas |
| --- | --- | --- | --- |
| `pagina` | int ≥ 1 | 1 | |
| `tamanho` | int 1..100 | 25 | teto 100 |
| `plataformaOrigem` | enum | — | uma das 7 |
| `statusCanonico` | CSV de enum | — | ex.: `PAGO,PENDENTE` |
| `classificacao` | CSV de enum | — | ex.: `VENDA_PROPRIA,VENDA_AFILIADA` |
| `pagoDeFato` | `true`/`false` | — | `true` → só status onde `contaComoReceita` (hoje `PAGO`) |
| `pessoaId` | uuid | — | |
| `precisaRevisao` | `true`/`false` | — | |
| `ocorridoDe` | ISO date-time | — | `ocorrido_em >= ` |
| `ocorridoAte` | ISO date-time | — | `ocorrido_em <= ` |
| `q` | string | — | `id_origem` contém (case-insensitive) |

Query malformada (enum inválido, `tamanho` fora da faixa, data não-ISO) → **400** (zod).

### Resposta 200

```json
{
  "itens": [
    {
      "id": "0192...uuid",
      "plataformaOrigem": "GURU_PRD",
      "idOrigem": "txn_abc123",
      "tipoOrigem": "guru.webhook",
      "statusOrigem": "PAGO",
      "statusCanonico": "PAGO",
      "classificacao": "VENDA_PROPRIA",
      "ocorridoEm": "2026-08-30T14:02:00.000Z",
      "pessoaId": "0192...uuid",
      "ehAfiliada": false,
      "precisaRevisao": false,
      "valorBruto": { "valorInt": "19700000", "moeda": "BRL" },
      "valorLiquido": { "valorInt": "18500000", "moeda": "BRL" },
      "eventoOrigemId": "0192...uuid"
    }
  ],
  "pagina": 1,
  "tamanho": 25,
  "total": 137
}
```

- Ordenação: `ocorrido_em desc` (nulos por último), desempate `criado_em desc`.
- Valores monetários **sempre** `{ valorInt: string, moeda }` — nunca number/float. `null`
  quando o par não foi preenchido.
- Sem `payloadBruto`/`eventoCanonico` na lista.

## `GET /financeiro/transacoes/{id}`

### Resposta 200

```json
{
  "id": "0192...uuid",
  "plataformaOrigem": "GURU_PRD",
  "idOrigem": "txn_abc123",
  "tipoOrigem": "guru.webhook",
  "statusOrigem": "PAGO",
  "statusCanonico": "PAGO",
  "classificacao": "VENDA_PROPRIA",
  "ocorridoEm": "2026-08-30T14:02:00.000Z",
  "pessoa": { "id": "0192...uuid", "nome": "Fulana de Tal" },
  "ofertaId": null,
  "contratoId": null,
  "transacaoVinculadaId": null,
  "valorBruto":    { "valorInt": "19700000", "moeda": "BRL" },
  "valorLiquido":  { "valorInt": "18500000", "moeda": "BRL" },
  "taxas":         { "valorInt": "1200000",  "moeda": "BRL" },
  "reembolso":     null,
  "quantidade": 1,
  "ehAfiliada": false,
  "ehRecorrencia": false,
  "assinaturaCiclo": null,
  "numeroCiclo": null,
  "ofertaCodigoOrigem": "PCS48XAV",
  "ofertaNomeOrigem": "[#PCS48XAV] Programa Consultório Smart — Turma 48",
  "precisaRevisao": false,
  "motivoRevisao": null,
  "eventoOrigemId": "0192...uuid",
  "criadoEm": "2026-08-30T14:03:11.000Z",
  "atualizadoEm": "2026-08-30T14:03:11.000Z"
}
```

- `id` inexistente → **404**.
- `pessoa` é `null` quando `pessoa_id` é `null` (comprador não resolvido / afiliada).
- `eventoOrigemId` permite ao painel linkar `/eventos/{id}` (spec 006) e ver `payload_bruto`
  + a linha do tempo das 7 etapas, incl. `resultado.campos_alterados` da última aplicação.

## Não expostos nesta spec

- Nenhum `POST`/`PATCH`/`DELETE` de `transacao` (Princípio VIII — só o pipeline escreve).
- `POST /transacoes/{id}/tentar-vincular` e `.../tentar-vincular-pendentes` → **spec 024**.
- Query de receita agregada → **spec 024/025**.
