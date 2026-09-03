# Contract: base de auditoria + config tipada

Fonte de verdade: `backend/src/core/auditoria/*` e `backend/src/core/config/index.ts`.
Puro, sem banco, sem tabela.

## `EntidadeAuditavel`

```
interface EntidadeAuditavel {
  readonly criadoEm: Date;      // UTC; definido na criação, nunca muda
  readonly atualizadoEm: Date;  // UTC; = criadoEm na criação; toda escrita persistida atualiza
}
```

- Contrato a ser adotado por **toda** entidade de negócio futura (nenhuma nesta spec).
- Convenção Prisma associada: colunas `@db.Timestamptz` (documentada, não gerada aqui).

## `RegistroAuditoria` + `montarRegistroAuditoria`

```
enum OrigemMudanca { CURADORIA, AJUSTE_MANUAL, MIGRACAO }   // enum fechado

interface RegistroAuditoria {
  autor: string;
  quando: Date;            // UTC
  entidade: string;        // ex.: "produto"
  entidadeId: string;
  campo: string;
  valorAnterior: unknown;  // serializável
  valorNovo: unknown;      // serializável
  motivo: string;          // obrigatório, não vazio
  origem: OrigemMudanca;
}

montarRegistroAuditoria(
  dados: Omit<RegistroAuditoria, 'quando'> & { quando?: Date }
): RegistroAuditoria
```

| Regra | Comportamento |
| --- | --- |
| `quando` ausente | preenchido com `agoraUtc()` |
| `motivo` vazio / só espaços | `TypeError('motivo obrigatório')` |
| `origem` fora do enum | `TypeError('origem inválida')` |
| sucesso | devolve o registro normalizado (campos na ordem do contrato) |

Consumível pela spec 053 (painel de auditoria global) **sem redefinição**. Nenhuma tabela
`_audit` de negócio é criada aqui — isso é de cada spec dona.

## Contrato de config (`core` como dono)

Re-export tipado de `backend/src/config/` — **sem** redesenho, **sem** chave nova, **sem**
regressão da 001 (FR-032).

| Export de `core/config/index.ts` | Definição |
| --- | --- |
| `type AppConfig` | `z.infer<typeof envSchema>` (re-export de `../../config/env.schema`) |
| `accountConfig(cfg: AppConfig, plataforma: PlataformaOrigem)` | re-export; fatia `{ apiBaseUrl?, apiKey?, webhookToken? }` de uma conta ou `undefined` |
| `type LeitorConfig` | alias de `ConfigService<AppConfig, true>['get']` — assinatura para os contextos tiparem sua dependência de leitura |

### Regra de fronteira (nova nesta spec)

ESLint `no-restricted-syntax` barra `process.env.<qualquer>` em `backend/src/**` **exceto**:
`src/config/**`, `src/core/**`, `src/main.ts`. `test/**` também liberado.
→ Verificável: busca por `process.env` em código de contexto retorna zero (SC-009).

### Fluxo documentado (para `docs/002`)

```
.env (raiz)
  → NestConfigModule.forRoot({ validate: envSchema.parse })  // boot; falha cedo
  → ConfigService<AppConfig, true>  (injetável, global)
  → contexto injeta e lê sua fatia:
        cfg.get('DATABASE_URL', { infer: true })
        accountConfig(cfg.get(... ) , PlataformaOrigem.GURU_PRD)
```

## Testes de contrato (`*.spec.ts`, unit, sem banco)

- `registro-auditoria.spec.ts`: `montarRegistroAuditoria` sem `quando` usa fake timer e bate
  o instante; `motivo: ""` → `TypeError`; `origem` string fora do enum → `TypeError`;
  registro válido tem todos os campos.
- Config: os testes da 001 (`env.schema.spec.ts`) continuam verdes (sem regressão); +1 teste
  de que `AppConfig`/`accountConfig` são importáveis a partir de `core` (compilação).
- Regra ESLint: `npm run lint -w backend` falha se um arquivo de contexto acessar
  `process.env` (verificado com um fixture temporário no PR, não commitado).
