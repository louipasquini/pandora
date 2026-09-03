# Contract: status canônico

Fonte de verdade: `backend/src/core/status/{status-transacao,status-contrato,resolver-status}.ts`.
Puro, sem banco. Padrão de enum idêntico ao `PlataformaOrigem` da 001.

## `StatusTransacaoCanonico`

```
enum StatusTransacaoCanonico {
  PENDENTE, PAGO, EM_ATRASO, RECUSADO, CANCELADO, ESTORNADO, CHARGEBACK, DESCONHECIDO
}
```

`STATUS_TRANSACAO_CANONICO: readonly StatusTransacaoCanonico[]` — array congelado na ordem acima.

| Função | Assinatura | Tabela-verdade |
| --- | --- | --- |
| `liberaAcesso` | `(s: StatusTransacaoCanonico) => boolean` | `PAGO`, `PENDENTE`, `EM_ATRASO` → `true`; `RECUSADO`, `CANCELADO`, `ESTORNADO`, `CHARGEBACK`, `DESCONHECIDO` → `false` |
| `contaComoReceita` | `(s: StatusTransacaoCanonico) => boolean` | só `PAGO` → `true`; todos os outros → `false` |

- Implementadas com `switch` exaustivo + `default: never` — o compilador falha se um valor
  novo do enum não for tratado.
- `liberaAcesso(EM_ATRASO) === true` é **decisão fechada**: o `core` é permissivo; a
  revogação por tolerância expirada é do contexto `contratos` (spec 025).

## `StatusContratoCanonico`

```
enum StatusContratoCanonico { ATIVO, EXPIRADO, CANCELADO, DESCONHECIDO }
```

`STATUS_CONTRATO_CANONICO: readonly StatusContratoCanonico[]` — array congelado.

| Função | Assinatura | Regra |
| --- | --- | --- |
| `contratoLiberaAcesso` | `(s: StatusContratoCanonico) => boolean` | só `ATIVO` → `true`; `EXPIRADO`, `CANCELADO`, `DESCONHECIDO` → `false` |

Renovação/prorrogação **não** são valores deste enum (rótulo derivado do estado de acesso na
data — visão Parte 7).

## `paraStatusTransacaoCanonico` (rede de segurança)

```
paraStatusTransacaoCanonico(bruto: unknown): { status: StatusTransacaoCanonico; revisar: boolean }
```

| `bruto` | Resultado |
| --- | --- |
| valor **exato** do enum (ex.: `"PAGO"`) | `{ status: bruto, revisar: false }` |
| string desconhecida, `null`, `undefined`, número, objeto | `{ status: DESCONHECIDO, revisar: true }` |

**Não** faz `trim` / `lowercase` / sinônimos — o mapa rico de vocabulário por plataforma é
dos adapters (specs 019–022). Aqui é só "nunca vira ativo por engano" (FR-023).

## Testes de contrato (`*.spec.ts`, unit, sem banco)

- `status-transacao.spec.ts`: para **cada** um dos 8 valores, asserta o par
  `(liberaAcesso, contaComoReceita)` conforme a tabela; `it.each(STATUS_TRANSACAO_CANONICO)`
  garante cobertura total.
- `status-contrato.spec.ts`: `contratoLiberaAcesso(ATIVO) === true`; os outros 3 → `false`.
- `resolver-status.spec.ts`: `"PAGO"` → `{ PAGO, revisar: false }`; `"pago"`, `"aprovado"`,
  `""`, `null`, `undefined`, `42`, `{}` → `{ DESCONHECIDO, revisar: true }`.
