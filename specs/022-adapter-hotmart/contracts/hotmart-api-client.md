# Contrato — `HotmartApiClient` (spec 022)

`src/ingestao/adapters/hotmart/hotmart-api-client.port.ts` (interface + token DI +
`HotmartApiIndisponivelError`) · `hotmart-api-client.ts` (`HotmartApiClientHttp`, `fetch`
nativo do Node 24, **0 dep**).

```ts
export const HOTMART_API_CLIENT = Symbol('HOTMART_API_CLIENT');

export interface ParametrosListarHotmart {
  conta: 'HOTMART_PRD' | 'HOTMART_SVC';
  dataInicio: string;      // 'YYYY-MM-DD'
  dataFinal: string;       // 'YYYY-MM-DD'
  transactionStatus?: string;
  cursor?: string;         // page_info.next_page_token
}
export interface PaginaHotmart { itens: unknown[]; proximoCursor?: string; }

export interface HotmartApiClient {
  listarVendas(p: ParametrosListarHotmart): Promise<PaginaHotmart>;
  listarDetalhesPreco(p: ParametrosListarHotmart): Promise<PaginaHotmart>;
}

export class HotmartApiIndisponivelError extends Error {
  constructor(conta: string) { super(`conta ${conta} sem API configurada`); }
}
```

## OAuth2 `client_credentials` (impl real)

- `garantirToken(conta)`: se `!cache[conta] || Date.now() >= cache[conta].expiraEm - 60_000`:
  ```
  POST {OAUTH_BASE}/security/oauth/token?grant_type=client_credentials
       &client_id={HOTMART_<conta>_CLIENT_ID}&client_secret={HOTMART_<conta>_CLIENT_SECRET}
  headers: { Authorization: `Basic ${HOTMART_<conta>_API_KEY}`, Accept: application/json }
  ```
  `OAUTH_BASE` = `https://api-sec-vlc.hotmart.com` (constante).
  Resposta `{ access_token, expires_in }` → `cache[conta] = { token, expiraEm: Date.now() +
  expires_in*1000 }`.
- Falta `HOTMART_<conta>_CLIENT_ID` **ou** `_CLIENT_SECRET` **ou** `_API_KEY` →
  `throw new HotmartApiIndisponivelError(conta)` (o `HotmartSyncService` converte para **422**).
- Leitura de chaves só pelo `ConfigService` destipado (`cfg.get<string>('HOTMART_PRD_CLIENT_ID')`
  etc.), como o `GuruApiClientHttp`.

## Chamadas de dados

- `listarVendas` → `GET {BASE}/sales/history`; `listarDetalhesPreco` → `GET
  {BASE}/sales/price/details`.
- `BASE` = `HOTMART_<conta>_API_BASE_URL` || `https://developers.hotmart.com/payments/api/v1`.
- Query: `start_date` / `end_date` = `Date.parse(`${dataInicio}T00:00:00Z`)` /
  `Date.parse(`${dataFinal}T23:59:59Z`)` (epoch ms); `max_results=500`;
  `transaction_status` (repetido por valor CSV, se informado); `page_token` (quando `cursor`).
- Header `Authorization: Bearer ${await garantirToken(conta)}` + `Accept` + `User-Agent:
  pandora-ingestao`.
- Resposta `{ items: [...], page_info: { next_page_token? } }` →
  `{ itens: items, proximoCursor: page_info?.next_page_token || undefined }`. Aceita também um
  array direto (defensivo).
- `res.status` não-2xx → `throw new Error('Hotmart /sales/history HTTP <status>')` (o
  `HotmartSyncService` trata como erro de página — commit por página).
- `AbortSignal.timeout(15_000)`.

## Dublê nos testes

`overrideProvider(HOTMART_API_CLIENT)` com um fake que devolve páginas pré-configuradas
encadeadas por cursor sintético (`p<n>`). A impl real **nunca** é exercida em teste
unitário/e2e.
