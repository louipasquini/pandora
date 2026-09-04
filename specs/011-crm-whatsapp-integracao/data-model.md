# Data Model — 011-crm-whatsapp-integracao

Todas as tabelas nascem no bounded context `crm` (já não-vazio desde 007/008/009/010).
5 tabelas novas + 6 enums novos. PK `id` UUID v7 gerado na aplicação (`uuidv7()` do
`core`), `@db.Timestamptz(6)` em todo timestamp. **Nenhuma tabela de auditoria nova** —
canal/template/opt-out auditam em `crm_admin_audit` (007), já entidade-agnóstica.

## Enums

```
TemplateWhatsappCategoria   MARKETING | UTILITY | AUTHENTICATION
TemplateWhatsappStatus      PENDENTE | APROVADO | REJEITADO | PAUSADO | DESABILITADO
MensagemWhatsappTipoConteudo TEXTO | IMAGEM | AUDIO | DOCUMENTO | VIDEO | OUTRO
MensagemWhatsappStatusEntrega RECEBIDA | ENVIADA | ENTREGUE | LIDA | FALHOU
EventoWebhookWhatsappStatus  PENDENTE | PROCESSADO | ERRO
OptOutWhatsappOrigem         PROPRIO_NUMERO | ATENDENTE
```

## `CanalWhatsapp`

Conexão configurada com um número de WhatsApp Business (Meta Cloud API). Lista (0..N),
não singleton — mesmo padrão de `Equipe`/`Integracao` (007), embora a operação real da AEN
use tipicamente 1 canal ativo.

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid | PK |
| `nome` | string | rótulo interno |
| `numeroTelefone` | string | exibição (ex.: `+55 11 91234-5678`) |
| `wabaId` | string | WhatsApp Business Account ID (Meta) |
| `phoneNumberId` | string | `phone_number_id` da Meta — usado nas chamadas Graph API e para **resolver o canal a partir do payload do webhook** |
| `accessTokenCifrado` | string | AES-256-GCM (`cifra.ts`, chave `CRM_INTEGRACAO_CIFRA_KEY`) |
| `accessTokenUltimos4` | string | máscara (`mascararSegredo`) |
| `appSecretCifrado` | string | usado para validar `X-Hub-Signature-256` do webhook |
| `appSecretUltimos4` | string | máscara |
| `webhookVerifyTokenCifrado` | string | usado no handshake `GET` (`hub.verify_token`) |
| `webhookVerifyTokenUltimos4` | string | máscara |
| `ativo` | boolean | default `true` |
| `ultimoWebhookRecebidoEm` | datetime? | atualizado a cada POST processado com sucesso |
| `criadoEm`/`atualizadoEm` | datetime | — |

- `@@unique([phoneNumberId])` — é a chave de resolução do canal a partir do payload.
- `@@index([ativo])`.
- Segredo nunca sai em `GET` — projeção expõe só `*Definido: boolean` + `*Mascarado: string`
  (mesmo contrato de `IntegracaoView`, spec 007).
- Sem `DELETE` físico — só `ativo=false` (mesmo padrão de `Equipe`/`Integracao`).

## `TemplateWhatsapp`

Modelo de mensagem pré-aprovado do lado da Meta, espelhado localmente pela sincronização
sob demanda (FR-006).

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid | PK |
| `canalId` | uuid | FK `CanalWhatsapp`, `onDelete: Restrict` |
| `nomeMeta` | string | nome do template na Meta |
| `idioma` | string | código de idioma Meta (ex.: `pt_BR`) |
| `categoria` | `TemplateWhatsappCategoria` | — |
| `corpo` | string | texto com placeholders (`{{1}}`, …) |
| `statusAprovacao` | `TemplateWhatsappStatus` | espelha o status da Meta |
| `motivoRejeicao` | string? | preenchido quando `REJEITADO` |
| `sincronizadoEm` | datetime | última sincronização bem-sucedida |
| `criadoEm`/`atualizadoEm` | datetime | — |

- `@@unique([canalId, nomeMeta, idioma])` — upsert idempotente na sincronização.
- `@@index([canalId, statusAprovacao])` — filtro comum ("templates aprovados deste canal").
- Só a Meta é fonte de verdade do `statusAprovacao`; o sistema nunca aprova/rejeita
  localmente (FR-006 é só espelho).

## `MensagemWhatsapp`

Detalhe 1:1 de uma `interacao` (spec 009) do tipo `WHATSAPP` — mantém `interacao`
agnóstica de canal (decisão em `research.md`).

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid | PK |
| `interacaoId` | uuid | FK `Interacao`, `onDelete: Cascade`, **único** (1:1) |
| `canalId` | uuid | FK `CanalWhatsapp`, `onDelete: Restrict` |
| `templateId` | uuid? | FK `TemplateWhatsapp`, `onDelete: Restrict`; não-nulo só quando enviada por template |
| `waMessageId` | string? | `wamid` da Meta (recebida) ou retornado no envio |
| `tipoConteudo` | `MensagemWhatsappTipoConteudo` | default `TEXTO` |
| `midiaIdExterno` | string? | id de mídia da Meta quando `tipoConteudo != TEXTO` (referência só — sem download, ver Assumptions do spec) |
| `statusEntrega` | `MensagemWhatsappStatusEntrega` | `RECEBIDA` (entrada) ou `ENVIADA`→`ENTREGUE`→`LIDA`/`FALHOU` (saída, via callback de status) |
| `erroDetalhe` | string? | preenchido quando `FALHOU` |
| `criadoEm`/`atualizadoEm` | datetime | — |

- `@@unique([interacaoId])`.
- Índice único **parcial** `(wa_message_id) WHERE wa_message_id IS NOT NULL` (migration.sql
  — Prisma não modela índice parcial) — usado para localizar a mensagem ao receber um
  callback de status (`statuses[]` do webhook).
- `@@index([canalId])`, `@@index([templateId])`.

## `EventoWebhookWhatsapp`

Registro cru e imutável de cada notificação POST recebida da Meta — a fonte de verdade da
qual `interacao`+`MensagemWhatsapp` são derivadas (Princípio IV, FR-003). Não reaproveita
`evento_origem`/`PlataformaOrigem` (decisão em `research.md`).

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid | PK |
| `canalId` | uuid? | FK `CanalWhatsapp`, `onDelete: Restrict`; `null` só no caso raro de `phone_number_id` não resolvido (webhook autêntico — assinatura já validada — mas payload aponta pra canal desconhecido) |
| `payloadBruto` | json | corpo exato recebido |
| `hash` | string | `sha256` do corpo bruto (bytes), determinístico |
| `recebidoEm` | datetime | — |
| `status` | `EventoWebhookWhatsappStatus` | default `PENDENTE`, atualizado ao fim do processamento síncrono |
| `erroDetalhe` | string? | preenchido quando `ERRO` (FR-014) |
| `criadoEm` | datetime | — |

- `@@unique([hash])` — reentregas idênticas da Meta (FR-015) resultam em short-circuit
  (200 imediato, sem reprocessar).
- `@@index([status, recebidoEm])`.
- **Sem** `atualizadoEm`/etapas — processamento é síncrono dentro do próprio request (ver
  research.md); não há worker nem reprocessamento assíncrono nesta spec.

## `OptOutWhatsapp`

Pedido de não receber mais mensagens iniciadas pela empresa (FR-012/FR-013). Modelado como
histórico de linhas — nunca um `UPDATE` que apague o pedido original (decisão em
`research.md`).

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid | PK |
| `telefone` | string | E.164 normalizado (`normalizarTelefone`, mesma função da 008) — chave de bloqueio de envio |
| `pessoaId` | uuid? | FK `Pessoa`, `onDelete: Restrict`; preenchido quando resolvido no momento do pedido |
| `leadId` | uuid? | FK `Lead`, `onDelete: Restrict`; idem |
| `origem` | `OptOutWhatsappOrigem` | `PROPRIO_NUMERO` (a própria pessoa escreveu pedindo) ou `ATENDENTE` (registrado manualmente) |
| `optadoEm` | datetime | — |
| `revertidoEm` | datetime? | `null` = opt-out **ativo** |
| `criadoEm`/`atualizadoEm` | datetime | — |

- `@@index([telefone, optadoEm])` — consulta "linha mais recente por telefone".
- Bloqueio de envio (FR-013) consulta: `WHERE telefone = ? ORDER BY optadoEm DESC LIMIT 1`
  → bloqueia se a linha existir e `revertidoEm IS NULL`.
- **Nunca** bloqueia o **recebimento** de mensagens que a própria pessoa envie (Assumptions
  do spec.md) — só o envio iniciado pela empresa (livre ou template).
- Pedido de opt-out com um telefone já ativo em opt-out é **idempotente** (no-op, devolve a
  linha existente) — não cria linha duplicada.

## Relações tocadas em tabelas existentes

Nenhuma coluna nova em `Interacao`, `Pessoa` ou `Lead` — só novas FKs **apontando para**
eles a partir das tabelas acima (mesmo precedente de `Oportunidade.pessoaId`/`leadId` da
010: FK direta no `schema.prisma` compartilhado, sem contrato novo no `core` — a fronteira
do Princípio VI é sobre import de módulo TypeScript, não sobre o schema).

- `MensagemWhatsapp.interacaoId` → `Interacao.id` (1:1).
- `OptOutWhatsapp.pessoaId`/`leadId` → `Pessoa.id`/`Lead.id` (opcionais, resolvidos no
  momento do pedido — não são uma âncora XOR obrigatória como `Interacao`/`Oportunidade`,
  porque `telefone` sozinho já é suficiente para bloquear o envio mesmo sem pessoa/lead
  resolvidos).

## Fluxo de resolução de destinatário (webhook de entrada, FR-004/FR-005)

1. Normaliza `wa_id` do remetente → `normalizarTelefone` (reaproveitada de
   `crm/domain/lead/normalizar-lead.ts`, mesmo bounded context).
2. Busca `Pessoa` via `PessoaTelefone.valor = normalizado` (query direta, mesmo precedente
   de FK direta acima) → se achar, âncora = pessoa.
3. Senão, busca `Lead.telefone = normalizado` → se achar, âncora = lead.
4. Senão, cria um novo `Lead` (`origem: 'whatsapp'`, `telefone: normalizado`, `nome`: do
   campo `contacts[].profile.name` do payload, ou o próprio telefone se ausente) — FR-005.
5. Chama `RegistrarInteracaoService.registrar(...)` com a âncora resolvida e a chave de
   idempotência `{canalOrigem: "whatsapp:<canalId>", idExterno: <wamid>}`.
