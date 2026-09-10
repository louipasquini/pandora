# Contrato — superfície HTTP da Hotmart (spec 022)

## `POST /ingestao/hotmart/sincronizar` — `@RequerPermissao('evento:ingerir')`, `@HttpCode(200)`

Corpo (`sincronizarHotmartSchema`, zod `.strict()`):

```ts
{
  conta: 'HOTMART_PRD' | 'HOTMART_SVC',   // obrigatória
  dataInicio: string,                      // 'YYYY-MM-DD' — obrigatória
  dataFinal: string,                       // 'YYYY-MM-DD' — obrigatória
  transactionStatus?: string,              // opcional, CSV de status Hotmart (repassado à API)
}
```

- Valida `dataInicio <= dataFinal` **e** `dataFinal - dataInicio <= 365 dias` → senão **422**
  (`janela acima de 365 dias`), **sem chamar a API**. `conta` fora do enum → **422** no DTO.
- `HotmartSyncService.sincronizar(dto)`:
  1. pagina `listarDetalhesPreco` (cursor) → `Map<transaction, detalhe>`;
  2. pagina `listarVendas` (cursor) — para cada item: `parseVendaApi(item, conta,
     mapa.get(item.purchase.transaction))` → `RegistrarEventoService.registrarEvento`.
  3. **Commit por página de vendas**; erro HTTP de página → `erros.push(...)`, `break`.
- `HotmartApiIndisponivelError` → **422** (`conta HOTMART_PRD sem API configurada`).
- Resposta: `{ conta, paginas, paginasDetalhePreco, recebidos, novos, dedup, ignorados,
  erros: string[] }`.

## `POST /ingestao/hotmart/importar-csv` — `@RequerPermissao('evento:ingerir')`, `@HttpCode(200)`

Corpo (`importarCsvHotmartSchema`, `.strict()`): `{ conta, conteudo: string (1..5 MiB),
fonte?: 'hotmart.csv' }`. `HotmartCsvImportService.importar(conta, conteudo)` → `parseCsvHotmart`
→ registra as válidas. Resposta `{ conta, linhas, novos, dedup, ignoradas, erros: string[] }`.
Linha malformada não aborta o lote. Idempotente por hash.

## `POST /webhooks/hotmart/prd` · `POST /webhooks/hotmart/svc` — públicos, `@HttpCode(200)`

`src/ingestao/hotmart/hotmart-webhooks.controller.ts` — `@Controller('webhooks/hotmart')`.

- **Guarda de flag (topo do handler)**: `cfg.HOTMART_WEBHOOK_ENABLED !== true` →
  `throw new ServiceUnavailableException({ message: 'webhook Hotmart não habilitado nesta
  versão' })` (**503**) — **antes** de autenticar/parsear. **0** `evento_origem`.
- Ligado: autentica via `WebhookAuthenticator.autenticar(PlataformaCore[conta], token)` onde
  `token` = header `x-hotmart-hottok` ?? `authorization: Bearer <...>`. Inválido/ausente/da
  outra conta → **401**, corpo genérico, **0** `evento_origem`.
- Autenticado: `parseWebhookHotmart(body, conta)` → para cada resultado com `idOrigem`,
  `RegistrarEventoService.registrarEvento`; sem `idOrigem` → `ignorados++`, logado, não
  registrado. Resposta **200** `{ registrados, ignorados, eventoIds }`.
- Falha de persistência (etapa 0) → propaga **5xx**. Erro de parse → **200** (evento cru
  registrado, `evento_canonico` nulo, segue para revisão).

## RBAC / allowlist

- `/webhooks/hotmart/*` cobertos pelo prefixo `/webhooks/` (allowlist pública da 003) — sem
  `JwtAuthGuard`/`PermissionGuard`.
- `/ingestao/hotmart/*` sob `evento:ingerir` (catálogo desde a 006) — **0 permissão nova**.
