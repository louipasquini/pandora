# Plano de Implementação — Adaptadores de borda da Guru (spec 021)

**Branch**: `021-adapter-guru` · **Spec**: [`spec.md`](./spec.md) · **Molde**: specs 019 (TMB)
e 020 (Asaas)

## Resumo

Borda de entrada das **duas contas Guru** (`GURU_PRD`, `GURU_SVC`). 3 funções **puras**
`parse*()` (webhook de Vendas `{ id, status, dates, payment, contact, product, subscription,
type, api_token }` / API `GET /api/v2/transactions` **cursor**, janela ≤ 180 d / CSV de
export) → `EventoCanonico` do `core`, **recebendo a `conta` como parâmetro**, testadas contra
**fixtures reais sem tocar o banco** (Princípio III). Vivem em `src/ingestao/adapters/guru/`;
**não importam `financeiro`/`clientes`**. O `financeiro/domain/status-map/guru.ts`
(vocabulário `approved`/`waiting_payment`/`refunded`/`chargeback`/… → `StatusTransacaoCanonico`,
compartilhado PRD/SVC e entre `guru.webhook`/`guru.api`/`guru.csv`) mora no `financeiro` e é
registrado via `Object.assign(MAPAS_STATUS, { GURU_PRD: GURU, GURU_SVC: GURU })`.

**Superfície HTTP fina**: 2 webhooks públicos por conta `POST /webhooks/guru/{prd,svc}`
(prefixo `/webhooks/` já é allowlist da 003; auth real = `api_token` **no corpo** verificado
em tempo constante pelo `WebhookAuthenticator` da 003; token errado/ausente/da outra conta →
**401**, 0 evento; **não** HMAC) + 2 endpoints `POST /ingestao/guru/{sincronizar,importar-csv}`
sob a permissão **já existente** `evento:ingerir` (`conta` obrigatória no corpo). Todos são
invólucros finos que só chamam `RegistrarEventoService.registrarEvento` — o worker faz
classificar → resolver pessoa (018) → upsert transação (018). **Nenhum `INSERT` direto,
nenhuma etapa nova** — `worker.service.ts` / `etapas.ts` / `pipeline-wiring.module.ts` /
`classificar.ts` / `schema.prisma` sem diff.

`GuruApiClient` atrás de interface + token DI (`GURU_API_CLIENT`), impl com `fetch` nativo do
Node 24 (0 dep — padrão `TmbApiClient`/019, `AsaasApiClient`/020): header `Authorization:
Bearer <GURU_<conta>_API_KEY>`, base `GURU_<conta>_API_BASE_URL` ??
`https://digitalmanager.guru/api/v2`; pagina **por cursor** (`next_cursor` enquanto
`has_more_pages`); dublê nos e2e; sem `GURU_<conta>_API_KEY` → `GuruApiIndisponivelError` →
`/sincronizar` responde **422**.

**0 migração, 0 tabela, 0 dependência nova, 0 chave `.env` nova** (`GURU_PRD_*`/`GURU_SVC_*`
já em `accountConfig` da 001/003), **0 porta nova, 0 permissão nova, 0 frontend**.
`CONTEXT_MODULES` segue **11**.

## Constitution Check (portão)

| Princípio | Como esta spec cumpre |
| --- | --- |
| **I — Modelar o domínio, não a origem** | Nenhuma regra de negócio conhece "Guru". O adapter só produz `EventoCanonico` (contrato do `core`). `id_origem` = `transaction.id` em `*_origem_ref`/coluna comum, nunca PK. |
| **II — Clarificar antes de assumir** | 3 decisões ambíguas (G-01 chave natural, G-02 sem `referenciaExterna`, G-03 escopo) levadas ao dono do produto em 2026-09-10. Demais = defaults documentados (G-04..G-18). Zero `NEEDS CLARIFICATION`. |
| **III — Bordas finas, núcleo canônico** | 3 `parse*()` **puras**, sem banco/rede, testadas contra **fixtures reais** em `adapters/guru/fixtures/`. `status-map` justificado por fixture (SC-014). |
| **IV — Ingestão como log + projeções** | O adapter só chama `RegistrarEventoService.registrarEvento` (etapa 0). Evento cru imutável; projeção pelo worker. Nenhum `commit()` de remendo. |
| **V — Tudo agregado é derivado** | O adapter não agrega. `Dinheiro` por `{valorInt, moeda}` — moeda de `payment.currency` (nunca soma moedas); `float` proibido. |
| **VI — Contextos delimitados** | `adapters/guru` importa só `core`. `status-map/guru.ts` mora no `financeiro` (dono de `status_canonico`), não importa `ingestao`. ESLint `import/no-restricted-paths` + `grep` no e2e. |
| **VII — Curadoria ≠ derivação** | N/A — o adapter não escreve curadoria. |
| **VIII — Superfície de escrita mínima / sync sob demanda** | 2 webhooks + 2 endpoints. **Nenhuma** sincronização automática — `POST /ingestao/guru/sincronizar` manual. 0 permissão nova. |

**Padrões transversais**: IDs (`transaction.id` fora da PK) ✅ · Dinheiro (`Dinheiro.deDecimal`,
×10000, moeda de `payment.currency` ?? `BRL`) ✅ · Tempo (`ocorridoEm` string crua; `parseInstante`
na etapa 3) ✅ · Status (`status-map` + `mapearStatus` → `DESCONHECIDO`+revisar fora do mapa)
✅ · Idempotência (dedup por hash na etapa 0) ✅ · Multi-conta (`GURU_PRD`/`GURU_SVC` em toda
query) ✅ · Segredo (`api_token` removido antes de persistir — G-14) ✅.

**Veredito**: PASS. Nenhuma emenda à constituição. Nenhuma peça de stack trocada.

## Testing

### Unitário (sem banco) — `src/ingestao/adapters/guru/*.spec.ts` + `financeiro/domain/status-map/guru.spec.ts`

- `normalizar-guru.spec.ts` — `dinheiroDeValorGuru` (`500` → `5000000n`; `19.9` → `199000n`;
  `"abc"`/`NaN`/`-5`/`1e3` → `undefined` + erro; moeda `USD` respeitada); `enderecoDeGuru`;
  `telefonesDeString` com código local + número; `soDigitos`.
- `parse-webhook.spec.ts` — contra fixtures (× `GURU_PRD`): campos mapeados; `type: "affiliate"`
  → `ehAfiliada: true`; `product.type: "plan"` + `subscription.id` + `invoice.cycle` →
  `assinatura`; chave inédita ignorada; **`payload_bruto` sem `api_token`**; sem `id` → erro
  sem lançar; array de 1 item; `payment.currency` propagada para os `Dinheiro`.
- `parse-transacao-api.spec.ts` — contra a fixture de página da API; item sem `payment.net`
  usa só `bruto`.
- `parse-linha-csv.spec.ts` — separador `;`; aspas; comprador montado; linha sem `id` →
  `erros: ["linha N: sem identificador de transação"]`; cabeçalho sem `id` → todas em erro,
  não lança.
- `guru-api-client.spec.ts` — dublê global de `fetch`; 2 páginas encadeadas por `next_cursor`
  depois `has_more_pages` falso → 2 chamadas, para; monta a query string certa
  (`ordered_at_ini`/`ordered_at_end`/`cursor`); header `Authorization: Bearer`; chave ausente
  → lança `GuruApiIndisponivelError`.
- `status-map/guru.spec.ts` — cada `(fonte,bruto)` → canônico esperado, `revisar:false`;
  `('GURU_PRD','guru.webhook','approved')===PAGO`; `('GURU_SVC','guru.api','refunded')===ESTORNADO`;
  `'chargeback'===CHARGEBACK`; bruto inédito (`trial`) → `DESCONHECIDO`+`revisar`; não
  normaliza caixa (`Approved` → revisar); varredura "toda chave de `VOCABULARIO` aparece em
  `status` de alguma fixture dos parsers".

### e2e backend — `backend/test/guru-adapter.e2e-spec.ts` (Postgres real, container isolado `pandora-db-spec021` na porta **55438**)

- **US1** — `POST /webhooks/guru/prd` venda `approved` + `api_token` → `200`, 1
  `evento_origem` `guru.webhook`, `payload_bruto` sem `api_token`; `processar` → 1 `transacao`
  `(GURU_PRD, id)` `status_canonico=PAGO`, `oferta.codigoOrigem` setado. `waiting_payment` →
  `PENDENTE`. `chargeback` → `CHARGEBACK` + `REEMBOLSO`.
- **US1 guard** — sem `api_token` / token de SVC em `/prd` / token de PRD em `/svc` → `401`,
  `count(evento_origem)==0`.
- **US1 segredo** — `grep` do valor do `api_token` no `evento_origem` = 0 (SC-003).
- **US2** — `type: "affiliate"` → `classificacao=VENDA_AFILIADA`; `plan` + `invoice.cycle=3`
  → `classificacao=RECORRENCIA`; 1ª venda de plano `rejected` + `subscription` vazio → sem
  `assinatura`, `status_canonico=RECUSADO`.
- **US2 refund** — `approved` seguido de `refunded` mesmo `id` → 2 eventos, **1** transação,
  `ESTORNADO` + `REEMBOLSO` (SC-004).
- **US2 revisão** — `status: "trial"` → `DESCONHECIDO` + `precisa_revisao` +
  `evento_origem.status=revisar` (SC-006).
- **US3** — `sincronizar` com dublê de 2 páginas encadeadas por cursor → `{paginas:2,...}`;
  re-disparo → `novos:0`; `conta` fora do enum → 422; janela > 180 dias → 422 (API não
  chamada); sem `GURU_PRD_API_KEY` → 422.
- **US4** — `importar-csv` 5 boas + 1 ruim → `{linhas:6,novos:5,ignoradas:1}`; 2º import →
  `novos:0`; separador `;`.
- **SC-015** — evento em `/prd` e em `/svc` para o mesmo `transaction.id` → 2 transações
  distintas.
- **Fronteira** — `grep` de `financeiro`/`clientes` em `adapters/guru` = 0; `grep` de
  `ingestao` em `status-map` = 0.
- **Regressão** — `/admin/rbac/permissoes` sem `guru:` novo; `/health` = 11; `git diff` sem
  tocar `worker.service.ts`/`etapas.ts`/`pipeline-wiring.module.ts`/`classificar.ts`/`schema.prisma`.
- **Suíte 003–021 completa** verde contra o Postgres isolado (`55438`).

## Fases (ver `tasks.md`)

A. Fixtures reais → B. Parsers puros + helpers → C. `GuruApiClient` (cursor) → D.
`status-map/guru.ts` → E. Controllers finos → F. e2e → G. Qualidade + docs.
