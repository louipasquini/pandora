# Contract: HTTP — retry manual de vínculo

Todas as rotas sob `/financeiro/transacoes` (controller já existente desde a spec 018,
`transacao.controller.ts`). Autenticação JWT (spec 003) + RBAC (spec 004) em todas.

## `POST /financeiro/transacoes/{id}/tentar-vincular`

**Permissão**: `transacao:vincular` (nova).

Tenta resolver o vínculo da transação `{id}` agora, chamando a mesma lógica de domínio que a
etapa 4 usa (papel decidido pela `plataformaOrigem` da própria transação).

- Transação Asaas com referência externa, ainda não vinculada, Guru pareada já existe →
  `200 { vinculado: true, transacaoVinculadaId, vinculoId }`.
- Transação Asaas com referência externa, Guru pareada ainda não existe → `200 { vinculado:
  false }` (não é erro).
- Transação Asaas **sem** referência externa (nunca terceirizada) → `422 { erro:
  'transacao_nao_terceirizada' }`.
- Transação Guru → tenta resolver as Asaas pendentes que apontam para ela (mesmo ramo do
  executor) → `200 { pendentesResolvidas: number }`.
- Transação de outra plataforma (TMB/Hotmart) → `422 { erro: 'plataforma_nao_aplicavel' }`.
- Transação já vinculada (papel Asaas) → `200` no-op, devolve o vínculo já existente (mesmo
  formato do caso "resolveu agora" — idempotente, Princípio VII).
- `id` inexistente → `404`.

## `POST /financeiro/transacoes/tentar-vincular-pendentes`

**Permissão**: `transacao:vincular` (mesma).

Varre **todas** as transações Asaas pendentes (`plataformaOrigem IN (ASAAS_PRD, ASAAS_SVC) AND
referenciaExternaIdOrigem IS NOT NULL AND transacaoVinculadaId IS NULL`) e tenta resolver cada
uma contra o estado atual do banco.

Corpo: nenhum. Resposta:

```json
{ "tentativas": 12, "resolvidos": 5 }
```

Nunca erro por "nada para fazer" — 0 pendentes → `{ tentativas: 0, resolvidos: 0 }`.

## `GET /financeiro/transacoes` (spec 018, estendido)

Novo filtro de query opcional: `vinculoPendente=true|false` — mesma semântica derivada de
`data-model.md` (só afeta transações Asaas; combina com os filtros já existentes via `AND`).

## `GET /financeiro/transacoes/{id}` (spec 018, estendido)

O objeto de detalhe já expõe `transacaoVinculadaId` (reservado desde a 018, agora
efetivamente preenchido). Esta spec adiciona:

```json
{
  "vinculo": {
    "transacaoVinculadaId": "…",
    "origemRef": "…",
    "resolvidoEm": "2026-09-11T12:00:00.000Z"
  }
}
```

`vinculo: null` quando não há vínculo (transação não terceirizada, ou pendente).
