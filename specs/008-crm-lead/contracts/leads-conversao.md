# Contract — Conversão Lead → Pessoa

## `POST /crm/leads/:id/converter`

Guard: **`@RequerPermissao('lead:editar', 'pessoa:editar')`** (semântica E do
`PermissionGuard` da 004 — falta de qualquer uma → 403 genérico, nada é escrito).

Também sujeito ao escopo de visão: lead fora do escopo do sujeito → **404**.

### Pré-condições (domínio puro `podeConverter(lead)`)

| `lead.status` | Resultado |
|---|---|
| `ATIVO` | prossegue |
| `DESCARTADO` | **409** `{ "erro": "lead_descartado" }` |
| `CONVERTIDO` | **200** no-op — devolve o `pessoaId` atual, **0** auditoria, **0** escrita em `pessoa` |

O `estagio` **não** restringe (um `DESQUALIFICADO` + `ATIVO` converte).

### Fluxo (síncrono, transacional)

1. `dados = montarDadosIdentidade(lead)` — mapeia `documento`/`email`/`telefone`/`nome` do
   lead para `DadosIdentidadeLead` (ver `porta-identidade.md`).
2. `$transaction`:
   a. `res = porta.resolverOuCriar(dados, { criar: true, origem: { plataformaOrigem:
      'crm_lead', refs: [{ tipoRef: 'lead_id', valorRef: lead.id }] } })` — a
      `PortaIdentidade` (adaptador da 005) resolve uma `pessoa` existente por
      documento→email→telefone **ou** cria uma nova, anexando `pessoa_origem_ref`.
   b. `lead.pessoa_id = res.pessoaId`; `lead.status = 'CONVERTIDO'`;
      `lead.convertido_em = agoraUtc()`.
   c. **1** `crm_lead_audit` `motivo="converter"`, delta
      `{ status: ['ATIVO','CONVERTIDO'], pessoa_id: [null, res.pessoaId] }`.
3. `200`:
```jsonc
{ "leadId": "...", "pessoaId": "...", "criouPessoa": true, "status": "CONVERTIDO" }
```

### Idempotência (SC-004)

- Converter o **mesmo** lead 2× → 2ª chamada é no-op: mesmo `pessoaId`, **nenhuma** escrita
  nova em `pessoa`/contatos (a `PortaIdentidade` é idempotente por chaves `@@unique`), **0**
  `crm_lead_audit` novo.
- Dois leads distintos com o mesmo e-mail → ambos recebem o **mesmo** `pessoaId`; nenhum
  contato duplicado.

### Fronteira arquitetural (SC-005)

- `src/crm/**` **não** importa `src/clientes/**` (ESLint `import/no-restricted-paths` + o
  e2e faz `grep -R "clientes" src/crm/ → 0`, exceto comentários).
- O `crm` injeta `@Inject(PORTA_IDENTIDADE) porta: PortaIdentidade` — a interface do `core`.
- O `crm` **nunca** faz `prisma.pessoa.*` — toda escrita em `pessoa` passa pela porta.

### Erros

| Situação | HTTP |
|---|---|
| sem `lead:editar` ou sem `pessoa:editar` | 403 |
| lead fora do escopo de visão / inexistente | 404 |
| `status = DESCARTADO` | 409 |
| `PortaIdentidade` lança (dados inconsistentes) | 422 com motivo; nada commitado |
