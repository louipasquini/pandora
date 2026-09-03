# Quickstart — Validação da spec 002 (core value objects)

Roteiro para provar que as primitivas do `core` funcionam ponta a ponta. **Sem banco, sem
servidor** — tudo é unit + lint + typecheck.

## Pré-requisitos

- Ambiente da 001 já montado (`npm ci` na raiz; Node 24). Nenhum `.env` extra, nenhum
  Postgres necessário para esta spec.

## Comandos

```bash
# na raiz do monorepo
npm run lint            # inclui a nova regra: process.env só em config/core/main
npm run typecheck       # switch exaustivo de status compila; branded Moeda tipa
npm test                # unit do backend + frontend (frontend inalterado)

# foco no backend
npm test -w backend

# matriz de timezone para o parser de tempo (prova SC-004)
TZ=UTC                npm test -w backend -- tempo
TZ=America/Sao_Paulo  npm test -w backend -- tempo
TZ=Asia/Tokyo         npm test -w backend -- tempo
```

Windows PowerShell para a matriz de TZ:

```bash
$env:TZ='UTC';                npm test -w backend -- tempo
$env:TZ='America/Sao_Paulo';  npm test -w backend -- tempo
$env:TZ='Asia/Tokyo';         npm test -w backend -- tempo
```

## Cenários de validação (o que os testes provam)

| # | Cenário | Arquivo | Esperado |
| --- | --- | --- | --- |
| 1 | `Dinheiro.deDecimal("1234.5678","BRL")` | `dinheiro.spec.ts` | `valorInt === 12345678n`, `moeda === "BRL"` |
| 2 | Somar mesma moeda; imutabilidade | `dinheiro.spec.ts` | novo `Dinheiro`; operandos inalterados |
| 3 | Somar / comparar ordem BRL + USD | `dinheiro.spec.ts` | `Error` nomeando `BRL` e `USD` |
| 4 | `"10.12345"` (5 casas) | `dinheiro.spec.ts` | `RangeError` de precisão |
| 5 | Round-trip de serialização (incl. `> 2^53`, negativo, `zero`) | `dinheiro.spec.ts` | `deSerializado(d.toJSON()).equals(d)` |
| 6 | `multiplicarPorEscalar(0.5)` / `NaN` | `dinheiro.spec.ts` | `TypeError` |
| 7 | `ratear(10.0000 BRL, 3)` | `ratear.spec.ts` | 3 parcelas somando exatamente `10.0000` |
| 8 | `criarMoeda("brl")` / `"XXX"` | `moeda.spec.ts` | `"BRL"` / `RangeError` |
| 9 | ISO com e sem fuso, epoch s vs ms | `parse-instante.spec.ts` | mesmo instante; naive → UTC + `motivo` |
| 10 | Lixo (`""`, `null`, `"01/03/2026"`, `{}`) | `parse-instante.spec.ts` | `valor: null` + `motivo` não vazio |
| 11 | Parser sob 3 timezones | `parse-instante.spec.ts` + CI | resultados idênticos |
| 12 | `liberaAcesso` / `contaComoReceita` para os 8 status | `status-transacao.spec.ts` | bate a tabela-verdade; `EM_ATRASO` → acesso `true` |
| 13 | `contratoLiberaAcesso` | `status-contrato.spec.ts` | só `ATIVO` → `true` |
| 14 | `paraStatusTransacaoCanonico(bruto)` | `resolver-status.spec.ts` | desconhecido → `{ DESCONHECIDO, revisar: true }` |
| 15 | `montarRegistroAuditoria` | `registro-auditoria.spec.ts` | `quando` default = `agoraUtc()`; `motivo` vazio → `TypeError` |
| 16 | Config sem regressão | `env.schema.spec.ts` (001) | continua verde; `AppConfig` importável de `core` |
| 17 | Fronteira `process.env` | `npm run lint` | erro se contexto acessa `process.env` |

## Definition of Done (checagem final)

- [ ] `npm run lint && npm run typecheck && npm test` verdes na raiz (backend + frontend).
- [ ] `npm run test:e2e -w backend` continua verde (nada da 001 regrediu).
- [ ] Matriz de `TZ` (3×) do teste de tempo: resultados idênticos.
- [ ] `docs/002-core-value-objects.md` criado (API + exemplos + trade-offs).
- [ ] `CLAUDE.md`, `README.md`, `ROADMAP.md` atualizados: `002` marcada, "Próxima" = `003`.
- [ ] Nenhuma porta nova; nenhum serviço novo; nenhuma migração.
