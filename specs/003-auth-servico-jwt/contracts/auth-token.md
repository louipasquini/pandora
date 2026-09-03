# Contract: `POST /auth/token`

Emite um JWT de serviço a partir das credenciais de serviço. **Público** (`@Public()`).
_Stateless_: nada é persistido. Rate-limited por IP.

## Request

```
POST /auth/token
Content-Type: application/json
```

```jsonc
{
  "client_id": "pandora-panel",
  "client_secret": "•••••••••••••••••"
}
```

- Corpo validado por zod (`dto/token-request.schema.ts`):
  `{ client_id: string.min(1), client_secret: string.min(1) }`.
- `Content-Type` diferente de `application/json`, corpo ausente, campo ausente/vazio, ou
  tipo errado → **400** (não 401).

## Responses

### 200 OK — credenciais corretas

```jsonc
{
  "access_token": "<jwt HS256>",
  "token_type": "Bearer",
  "expires_in": 43200          // segundos (= SERVICE_JWT_TTL resolvido)
}
```

Claims do `access_token`: `sub` = `SERVICE_CLIENT_ID`, `iss` = `"pandora"`, `iat`, `exp`
(= `iat + expires_in`, sempre ≤ `iat + 86400`). Header `alg` = `HS256`.

### 400 Bad Request — corpo malformado

```jsonc
{ "statusCode": 400, "error": "Bad Request", "message": "corpo inválido" }
```

Sem eco do corpo recebido (não vazar o secret tentado em mensagem de erro/log de validação).

### 401 Unauthorized — `client_id` e/ou `client_secret` incorretos

```jsonc
{ "statusCode": 401, "error": "Unauthorized", "message": "credenciais inválidas" }
```

- **Genérico**: não indica qual campo falhou.
- Comparação em tempo constante (D5) — sem _timing oracle_.
- Registrado em log interno: IP + `"auth.token.fail"` (nunca o secret).

### 429 Too Many Requests — _rate limit_ estourado

```
Retry-After: 37
```

```jsonc
{ "statusCode": 429, "error": "Too Many Requests", "message": "muitas tentativas, aguarde" }
```

Janela `RATE_LIMIT_WINDOW_MS` (60 s), limite `RATE_LIMIT_MAX` (10) por IP.

## Invariantes de teste

| # | Cenário | Esperado |
| --- | --- | --- |
| 1 | par correto | 200 + `access_token` verificável com `SERVICE_JWT_SECRET`, `exp-iat == expires_in` |
| 2 | `client_secret` errado | 401 genérico; corpo idêntico ao do `client_id` errado |
| 3 | `client_id` errado | 401 genérico |
| 4 | corpo `{}` / sem body / `text/plain` | 400 |
| 5 | 11ª tentativa em 60 s do mesmo IP | 429 + `Retry-After` |
| 6 | `access_token` usado em rota protegida | 200 (não 401) |
| 7 | header `alg:none` forjado no token | rejeitado pelo guard (401) — validação fixa em HS256 |
| 8 | resposta 401/400/429 | sem `stack`, sem nome de classe, sem distinção de causa |
