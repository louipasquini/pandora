# Contrato — `/ingestao/guru/*` (spec 021)

`src/ingestao/guru/guru-ingestao.controller.ts` — `@Controller('ingestao/guru')`, ambos
`@RequerPermissao('evento:ingerir')` (catálogo desde a 006 — **0 permissão nova**),
`@HttpCode(200)`. DTO inválido → **422** com `detalhes`.

## `POST /ingestao/guru/sincronizar`

Corpo (`sincronizarGuruSchema`, zod `.strict()`):

```ts
{
  conta: 'GURU_PRD' | 'GURU_SVC',      // obrigatória
  dataInicio: string,                   // 'YYYY-MM-DD' — obrigatória
  dataFinal: string,                    // 'YYYY-MM-DD' — obrigatória
  campoData?: 'ordered_at' | 'confirmed_at' | 'cancelled_at', // default 'ordered_at'
}
```

- Valida `dataInicio <= dataFinal` **e** `dataFinal - dataInicio <= 180 dias` → senão
  **422** (`janela acima de 180 dias`), **sem chamar a API**.
- `GuruSyncService.sincronizar(dto)`: paginação **por cursor** via `GuruApiClient`
  (`listarTransacoes({ conta, dataInicio, dataFinal, campoData, cursor })`), `cursor`
  `undefined` na 1ª chamada, `proximoCursor` da resposta nas seguintes, até
  `proximoCursor === undefined` ou `MAX_PAGINAS`. Cada item → `parseTransacaoApi` →
  `RegistrarEventoService.registrarEvento` (soma `novos`/`dedup` por `criado`). **Commit por
  página**.
- `GuruApiIndisponivelError` (chave da conta ausente) → `UnprocessableEntityException`
  (**422**).
- Erro HTTP de página → `erros.push(...)`, `break` (as páginas anteriores já registraram).

Resposta `200`:

```ts
{ conta, paginas, recebidos, novos, dedup, ignorados, erros: string[] }
```

## `POST /ingestao/guru/importar-csv`

Corpo (`importarCsvGuruSchema`, zod `.strict()`):

```ts
{ conta: 'GURU_PRD' | 'GURU_SVC', conteudo: string /* ≤ 5 MiB */, fonte?: 'guru.csv' }
```

- `GuruCsvImportService.importar(conta, conteudo)`: `parseCsvGuru` → registra os com
  `eventoCanonico`, soma o resto em `ignoradas` + `erros`. Idempotente por hash (2º import →
  `novos: 0`).

Resposta `200`:

```ts
{ conta, linhas, novos, dedup, ignoradas, erros: string[] }
```
