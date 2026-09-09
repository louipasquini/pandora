# Data Model: CRM · Disparos (WhatsApp)

Todas as entidades novas vivem no bounded context `crm`, ao lado de `CanalWhatsapp`/
`TemplateWhatsapp`/`MensagemWhatsapp`/`OptOutWhatsapp` (011) e `Segmento` (009), que são
reaproveitados sem alteração de schema.

## Enums novos

```
enum ExecucaoDisparoStatus { AGENDADO EM_ANDAMENTO CONCLUIDO CANCELADO ERRO }
enum MensagemDisparoStatus { PENDENTE ENVIANDO ENVIADA FALHOU PULADA }
enum DisparoVariante { A B }
```

`MensagemDisparoStatus` cobre só o que o **próprio disparo** controla até o momento em que a
mensagem sai pela Graph API; `ENTREGUE`/`LIDA` (o que acontece depois) é lido por `JOIN` em
`mensagem_whatsapp.status_entrega` (011) quando `mensagem_disparo.mensagem_whatsapp_id` não é
nulo — nunca duplicado como um 6º/7º valor deste enum (evita duas fontes de verdade para o
mesmo fato).

## `ExecucaoDisparo` (`execucao_disparo`)

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | UUID v7 | PK |
| `nome` | String | identificação livre na listagem |
| `canalId` | UUID | FK `CanalWhatsapp`, restrict |
| `templateId` | UUID | FK `TemplateWhatsapp` (variante única, ou variante A do teste A/B) |
| `templateBId` | UUID? | FK `TemplateWhatsapp` — variante B; `null` = sem teste A/B |
| `percentualVarianteB` | Int? | 0–100; obrigatório junto com `templateBId` (par ou nada) |
| `segmentoId` | UUID? | FK `Segmento`, restrict; `null` = só CSV |
| `csvCriarLead` | Boolean? | escolha feita na importação (FR-007a); `null` = sem CSV nesta execução |
| `agendadoPara` | DateTime? | `null` = envio imediato na criação |
| `status` | `ExecucaoDisparoStatus` | default `AGENDADO` se `agendadoPara` futuro, senão `EM_ANDAMENTO` já na criação |
| `iniciadoEm` | DateTime? | quando a materialização de destinatários rodou |
| `concluidoEm` | DateTime? | quando não resta `mensagem_disparo` não-terminal |
| `canceladoEm` | DateTime? | `POST .../cancelar` |
| `erroDetalhe` | String? | motivo quando `status = ERRO` (ex.: template desaprovado antes de enviar) |
| `criadoPor` | UUID? | FK `Usuario`, mesmo tratamento de `Segmento.criadoPor` (credencial de serviço → `null`) |
| `criadoEm`/`atualizadoEm` | Timestamptz | padrão |

**Validações** (na criação, `DisparoService.criar`):
- `segmentoId` ou ao menos uma importação de CSV associada — nunca os dois ausentes.
- `templateId` MUST estar `APROVADO` no canal informado; se houver `templateBId`, também
  MUST estar `APROVADO` e ser diferente de `templateId`.
- `templateBId` e `percentualVarianteB` MUST vir juntos ou nenhum dos dois.
- `agendadoPara`, se presente, MUST ser no futuro.

**Transições de `status`**:

```
AGENDADO ──(worker: horário chegou)──▶ EM_ANDAMENTO ──(sem pendente)──▶ CONCLUIDO
AGENDADO ──(POST cancelar)───────────▶ CANCELADO
EM_ANDAMENTO (criação imediata) ─────▶ CONCLUIDO | ERRO (template caiu antes do 1º envio)
```

## `DisparoContatoImportado` (`disparo_contato_importado`)

Snapshot de uma linha de CSV aceita na importação — 1 por telefone válido (após dedup dentro
do próprio arquivo, FR-007/US3).

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | UUID v7 | PK |
| `execucaoDisparoId` | UUID | FK `ExecucaoDisparo`, cascade |
| `telefone` | String | normalizado (E.164) |
| `nome` | String? | opcional, vindo do CSV |
| `leadId` | UUID? | preenchido quando `csvCriarLead=true` e um Lead foi criado/casado |
| `pessoaId` | UUID? | preenchido quando o telefone já corresponde a uma Pessoa existente |
| `criadoEm` | Timestamptz | |

Linhas **rejeitadas** na importação (telefone ausente/inválido) não geram registro — o
relatório de rejeitadas é devolvido só na resposta síncrona do `POST .../importar-csv`
(FR-007), não precisa de persistência própria.

`@@unique([execucaoDisparoId, telefone])` — mesmo telefone não duplica dentro do mesmo import.

## `MensagemDisparo` (`mensagem_disparo`)

Uma linha por destinatário **resolvido** (já deduplicado entre segmento e CSV, já checado
contra opt-out) de uma execução — nasce no momento da materialização (FR-006), não na
criação do disparo (para disparos agendados com origem em segmento).

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | UUID v7 | PK |
| `execucaoDisparoId` | UUID | FK `ExecucaoDisparo`, cascade |
| `telefone` | String | normalizado |
| `pessoaId` | UUID? | quando resolvido de um segmento de pessoa ou CSV casado |
| `leadId` | UUID? | quando resolvido de um segmento de lead ou CSV casado/criado |
| `variante` | `DisparoVariante`? | `null` quando a execução não tem teste A/B |
| `status` | `MensagemDisparoStatus` | default `PENDENTE` |
| `motivo` | String? | motivo de `FALHOU`/`PULADA` (ex.: `opt_out`, `telefone_invalido`, `template_nao_aprovado`, detalhe do provedor) |
| `tentativas` | Int | default 0; só incrementa em falha retentável (D-R5) |
| `mensagemWhatsappId` | UUID? | FK `MensagemWhatsapp`, `@unique`; preenchida só ao enviar de fato |
| `criadoEm`/`atualizadoEm` | Timestamptz | |

`@@unique([execucaoDisparoId, telefone])` — mesma garantia de dedup (FR-004) reforçada no
banco, não só na resolução em memória.

**Transições de `status`**:

```
PENDENTE ──(worker pega a linha)──▶ ENVIANDO ──(sucesso)──▶ ENVIADA (liga mensagem_whatsapp_id)
                                    ENVIANDO ──(falha retentável, tentativas < MAX)──▶ PENDENTE
                                    ENVIANDO ──(falha retentável, tentativas = MAX)──▶ FALHOU
(materialização) ──(opt-out/telefone inválido/template não aprovado)──▶ PULADA | FALHOU (terminal, direto)
```

## Índices e integridade (SQL bruto na migração — Prisma não modela `CHECK`)

- `execucao_disparo`: `CHECK` — `(templateBId IS NULL) = (percentualVarianteB IS NULL)`
  (D-01 do par variante B/percentual); `CHECK` — `agendadoPara IS NULL OR
  agendadoPara > criadoEm` não é necessário em banco (validado na aplicação; agendamento no
  passado é regra de negócio, não invariante de dado).
- `mensagem_disparo`: `@@unique([execucaoDisparoId, telefone])` (Prisma `@@unique` padrão);
  `mensagemWhatsappId String? @unique` — um `UNIQUE` comum já basta (Postgres não compara
  `NULL` a `NULL`, então várias linhas `PENDENTE`/`PULADA` com o campo nulo convivem sem
  precisar de índice parcial, diferente do caso de `mensagem_whatsapp.wa_message_id` na 011,
  que é `String` opcional mas nunca comparado dessa forma).
- `disparo_contato_importado`: `@@unique([execucaoDisparoId, telefone])` (Prisma padrão).

## Relação com entidades existentes (sem alteração de schema)

- `CanalWhatsapp`/`TemplateWhatsapp`: só lidos (FK restrict) — nenhuma coluna nova.
- `Segmento`: só lido via `construirWhere`/`validarFiltro` — nenhuma coluna nova.
- `MensagemWhatsapp`/`Interacao`: recebem uma linha nova por envio bem-sucedido, exatamente
  como um envio avulso da 011 — `mensagem_disparo.mensagem_whatsapp_id` aponta para essa
  linha depois de criada.
- `OptOutWhatsapp`: só lido via `OptOutWhatsappService.ativoPorTelefone`.
- `Lead`: `RegistrarLeadService.registrar` cria um Lead novo (`origem = 'csv-disparo'`,
  `idExterno = telefone`) só quando `csvCriarLead = true` e o telefone não corresponde a
  nenhuma Pessoa/Lead existente.
