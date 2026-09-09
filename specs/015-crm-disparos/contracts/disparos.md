# Contrato: `/crm/disparos/**`

Autenticado (`JwtAuthGuard`); todas as rotas exigem `PermissionGuard`. Erros seguem o padrão
já usado no projeto: 401 sem token, 403 sem permissão, 404 recurso inexistente, 422 validação
de negócio, 409 conflito de estado.

## Ciclo de vida do disparo

### `POST /crm/disparos` — `disparo:criar`

Cria uma execução de disparo. Corpo JSON (o upload de arquivo é resolvido no **frontend** —
`FileReader.readAsText()` sobre o `.csv` escolhido — e enviado aqui como texto simples,
mesmo padrão de "sem dependência de upload binário" do resto da API, que é 100% JSON desde a
001; evita puxar `multer`/`@types/multer` só para um campo de texto, research.md D-R6):

```jsonc
{
  "nome": "Abertura do lançamento X",
  "canalId": "uuid",
  "templateId": "uuid",
  "templateBId": "uuid",       // opcional — junto com percentualVarianteB
  "percentualVarianteB": 50,    // opcional — 0-100
  "segmentoId": "uuid",         // opcional — ao menos um entre segmentoId/csvConteudo
  "csvConteudo": "telefone,nome\n...", // opcional — conteúdo bruto do CSV já lido no navegador
  "criarLead": false,           // só relevante com csvConteudo (FR-007a); default false
  "agendadoPara": "2026-09-10T13:00:00Z" // opcional — ausente = imediato
}
```

- `segmentoId` ausente e nenhum `csvConteudo` → 422 `sem_destino`.
- `templateId`/`templateBId` não `APROVADO` no `canalId` → 422 `template_nao_aprovado`.
- `templateBId` sem `percentualVarianteB` (ou vice-versa) → 400 (formato inválido).
- `agendadoPara` no passado → 422 `agendamento_no_passado`.
- `csvConteudo` presente com linhas rejeitadas → aceita mesmo assim, relatório de rejeitadas
  vai na resposta (não bloqueia a criação, mesmo espírito de FR-007 "sem interromper a
  importação das linhas válidas").
- Sem `agendadoPara`: `status` nasce `EM_ANDAMENTO` e a materialização de destinatários roda
  **na mesma requisição** (síncrona — volume até poucos milhares, sem necessidade de resposta
  assíncrona); com `agendadoPara`: nasce `AGENDADO`, materialização acontece só no worker,
  mas as linhas do CSV já ficam salvas (`DisparoContatoImportado`) desde a criação.

Resposta: `201` com a projeção da `ExecucaoDisparo` + (quando houve `arquivo`) o relatório de
importação:

```jsonc
{
  "id": "uuid",
  "status": "EM_ANDAMENTO",
  // ...demais campos da projeção...
  "importacaoCsv": { "totalLinhas": 120, "aceitas": 115, "rejeitadas": [ { "linha": 4, "motivo": "telefone_ausente" } ] }
}
```

### `GET /crm/disparos` — `disparo:ver`

Lista paginada, filtrável por `status` e período (`criadoDe`/`criadoAte`). Cada item traz
contagens agregadas (enviadas/entregues/lidas/falhas/puladas) via `GROUP BY`.

### `GET /crm/disparos/{id}` — `disparo:ver`

Detalhe — dados da execução + contagens agregadas, separadas por variante quando há teste A/B.

### `GET /crm/disparos/{id}/destinatarios` — `disparo:ver`

Lista paginada de `MensagemDisparo`, filtrável por `status`; cada item mostra `motivo` quando
não for sucesso e `variante` quando aplicável. Status efetivo de entrega/leitura já vem
resolvido (join com `mensagem_whatsapp.status_entrega` quando existir).

### `GET /crm/disparos/{id}/export` — `disparo:ver`

Exporta o resultado detalhado (mesmas colunas da lista de destinatários) em CSV.

### `POST /crm/disparos/{id}/cancelar` — `disparo:cancelar`

Só válido para `status = AGENDADO` (senão 409 `disparo_nao_cancelavel`). Marca `CANCELADO`,
`canceladoEm = agora`.

### `POST /crm/disparos/processar` — `disparo:criar`

Dispara manualmente uma passada do worker (`WorkerService.processarPassada()`), mesmo padrão
determinístico de `POST /ingestao/eventos/processar` (006) e `POST /crm/workflow/processar`
(014) — usado por e2e e por quem quiser forçar o envio sem esperar o `setInterval`.

## Quality rating (estende a administração de WhatsApp da 011)

### `GET /crm/admin/whatsapp/canais/{id}/quality-rating` — `crm_admin:ver`

Consulta **sob demanda** a Graph API (nenhuma persistência). Resposta:

```jsonc
{ "qualityRating": "GREEN", "statusExibicao": "APPROVED", "consultadoEm": "2026-09-09T12:00:00Z" }
```

Canal inativo ou credencial inválida → `502 falha_provedor` (mesmo padrão de
`sincronizar` templates, 011).
