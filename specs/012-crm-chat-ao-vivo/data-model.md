# Data Model — 012-crm-chat-ao-vivo

Todas as tabelas nascem no bounded context `crm` (já não-vazio desde 007–011). 3 tabelas
novas + 3 enums novos, mais 2 colunas em tabelas já existentes (`interacao`, `equipe`). PK
`id` UUID v7 gerado na aplicação (`uuidv7()` do `core`), `@db.Timestamptz(6)` em todo
timestamp. **Nenhuma tabela de auditoria genérica nova** — o histórico de negócio desta spec
é 1ª classe (`transferencia_atendimento`/`resposta_atendimento`, ver `research.md` D-R4); a
configuração administrativa (SLA/mensagem por equipe) audita em `crm_admin_audit` (007).

## Enums

```
AtendimentoCanal       WHATSAPP | MANUAL
AtendimentoStatus      AGUARDANDO | EM_ATENDIMENTO | ENCERRADO
AtendimentoPrioridade  NORMAL | ALTA | URGENTE
```

## `Atendimento`

A conversa/caso de atendimento contínuo — o agrupador da fila. Âncora **polimórfica**
`pessoaId` **XOR** `leadId` (mesma disciplina de `Interacao`/`Oportunidade`, CL-01 da 009 /
D-01 da 010).

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid | PK |
| `pessoaId` | uuid? | FK `Pessoa`, `onDelete: Restrict` — âncora (XOR com `leadId`) |
| `leadId` | uuid? | FK `Lead`, `onDelete: Restrict` — âncora (XOR com `pessoaId`) |
| `canal` | `AtendimentoCanal` | `WHATSAPP` (criação automática via webhook) \| `MANUAL` (registrado por um atendente) |
| `canalWhatsappId` | uuid? | FK `CanalWhatsapp`, `onDelete: Restrict` — preenchido sse `canal = WHATSAPP` |
| `equipeId` | uuid? | FK `Equipe`, `onDelete: Restrict` — equipe atual (de onde veio o atendente, ou destino de uma transferência para fila de equipe) |
| `atendenteAtualId` | uuid? | FK `Usuario`, `onDelete: Restrict` — `null` enquanto `AGUARDANDO` sem ninguém disponível |
| `status` | `AtendimentoStatus` | default `AGUARDANDO` |
| `prioridade` | `AtendimentoPrioridade` | default `NORMAL` (D-06) |
| `abertoEm` | datetime | quando o atendimento foi criado |
| `primeiraRespostaEm` | datetime? | quando a 1ª resposta **humana** foi enviada (nunca a automática fora do expediente — D-04/D-R6) |
| `slaMinutos` | int | copiado de `Equipe.slaPrimeiraRespostaMinutos` (ou do default global) no momento da criação — congelado por atendimento, para que mudar a config da equipe não altere retroativamente atendimentos já abertos |
| `encerradoEm` | datetime? | — |
| `encerradoPorId` | uuid? | FK `Usuario`, `onDelete: Restrict` |
| `motivoEncerramento` | string? | — |
| `csatSolicitadoEm` | datetime? | marcado ao encerrar (D-R5) — elegibilidade de CSAT depende disto |
| `criadoEm`/`atualizadoEm` | datetime | — |

- `@@index([status, prioridade, abertoEm])` — ordenação da fila (D-06).
- `@@index([atendenteAtualId, status])` — cálculo de carga (`escolherAtendentePorCarga`).
- `@@index([equipeId, status])`.
- `@@index([pessoaId])` / `@@index([leadId])` — "atendimento aberto desta pessoa/lead neste
  canal" (FR-002).
- `CHECK (num_nonnulls(pessoa_id, lead_id) = 1)` — âncora exclusiva, via SQL bruto na
  migração (Prisma não modela `CHECK`; mesmo padrão 009/010).
- **`slaEstourado`/`minutosRestantes` nunca são colunas** — sempre calculados por
  `calcularSlaAtendimento(atendimento, agora)` (domínio puro) na leitura (Princípio V,
  D-R3).
- Sem `DELETE` físico — um atendimento só se move entre estados (`AGUARDANDO` →
  `EM_ATENDIMENTO` → `ENCERRADO`); nunca "some".

## `TransferenciaAtendimento`

Histórico **append-only** de 1ª classe — 1 linha por transferência (D-R4).

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid | PK |
| `atendimentoId` | uuid | FK `Atendimento`, `onDelete: Cascade` |
| `deAtendenteId` | uuid? | FK `Usuario`, `onDelete: Restrict` — `null` se vinha sem atendente (fila) |
| `paraAtendenteId` | uuid? | FK `Usuario`, `onDelete: Restrict` — `null` se foi para a fila de uma equipe sem ninguém disponível (FR-009) |
| `deEquipeId` | uuid? | FK `Equipe`, `onDelete: Restrict` |
| `paraEquipeId` | uuid? | FK `Equipe`, `onDelete: Restrict` |
| `transferidoPorId` | uuid? | FK `Usuario`, `onDelete: Restrict` — quem executou a transferência |
| `motivo` | string? | — |
| `criadoEm` | datetime | default `now()` |

- `@@index([atendimentoId, criadoEm])` — histórico ordenado de uma conversa (FR-008).
- Sem `PATCH`/`DELETE` — append-only, mesmo padrão de `oportunidade_movimentacao` (010).

## `RespostaAtendimento`

Detalhe 1:1 de uma `Interacao` de **saída** enviada dentro de um atendimento — "quem
respondeu, com/sem IA" (FR-012/FR-013, D-R4). Mesma disciplina de `MensagemWhatsapp` (011)
como detalhe 1:1 de uma `Interacao`.

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid | PK |
| `atendimentoId` | uuid | FK `Atendimento`, `onDelete: Cascade` |
| `interacaoId` | uuid | FK `Interacao`, `onDelete: Cascade`, **único** (1:1) |
| `atendenteId` | uuid | FK `Usuario`, `onDelete: Restrict` — quem respondeu (nunca nulo: a resposta automática fora do expediente **não** gera linha aqui — D-R6) |
| `viaIa` | boolean | default `false` — resposta assistida/gerada por IA (a geração em si é a spec 013; aqui só a flag) |
| `criadoEm` | datetime | default `now()` |

- `@@index([atendimentoId, criadoEm])` — histórico ordenado de respostas de uma conversa.
- `@@unique([interacaoId])` — 1:1.
- Sem `PATCH`/`DELETE` — append-only.

## Alterações em tabelas já existentes

### `Interacao` (spec 009) — +1 coluna

| Campo | Tipo | Notas |
| --- | --- | --- |
| `atendimentoId` | uuid? | FK `Atendimento`, `onDelete: SetNull` — agrupa a interação sob um atendimento, sem alterar nenhum outro contrato já validado pela 009 (âncora `pessoaId`/`leadId`, mutabilidade híbrida, `canalOrigem`/`idExterno`) |

- `@@index([atendimentoId, ocorridoEm])` — monta a timeline de um atendimento em ordem.
- `onDelete: SetNull` (não `Cascade`/`Restrict`): a interação em si é do domínio de
  `interacao` (009) e sobrevive independentemente de qualquer coisa acontecer com o
  `Atendimento` (que, na prática, nunca é apagado — mas a escolha documenta a intenção:
  `interacao` nunca perde dado por causa de `atendimento`).
- **Nenhuma mudança na função `validarCamposPorTipo`/`validarAncora`/mutabilidade da 009** —
  `atendimentoId` é só uma tag adicional, opcional, preenchida pela camada de aplicação
  desta spec.

### `Equipe` (spec 007) — +2 colunas

| Campo | Tipo | Notas |
| --- | --- | --- |
| `mensagemForaExpediente` | string? | texto do aviso automático (D-R6); `null` = sem aviso |
| `slaPrimeiraRespostaMinutos` | int? | prazo de SLA desta equipe; `null` = usa o default global (`ATENDIMENTO_SLA_PADRAO_MINUTOS`, constante no código — sem chave `.env` nova) |

- Só relevante para equipes `tipo = ATENDIMENTO`; para outras equipes os campos ficam `null`
  e nunca são lidos por esta spec.
- Configurados sob `crm_admin:gerir_atendimento` (RBAC novo desta spec), auditado em
  `crm_admin_audit` (reuso — configuração administrativa de baixo volume, mesmo raciocínio
  já usado pela 007/011 para canal/template).

## Portas in-process (exportadas do `CrmModule`)

- **`AbrirAtendimentoService.abrirOuReaproveitar(...)`** — chamada pelo
  `webhook-whatsapp.service.ts` (011, editado) logo após `RegistrarInteracaoService.
  registrar(...)` retornar uma interação **nova**: procura um `Atendimento` aberto
  (`AGUARDANDO`\|`EM_ATENDIMENTO`) para a mesma âncora+canal; se não achar, cria um novo e
  tenta o endereçamento automático (D-R2); em qualquer caso, marca `interacao.atendimentoId`
  e dispara a resposta automática fora do expediente quando aplicável (D-R6). Idempotente:
  reentrega da mesma interação (já coberta pela idempotência da 009 por
  `canalOrigem`/`idExterno`) nunca chama esta porta duas vezes para o mesmo evento, porque
  só é chamada quando `RegistrarInteracaoService` diz `criada: true`.
- **`RespostaAtendimentoService.registrarResposta(...)`** — chamada tanto pelo
  `atendimento.controller.ts` (resposta manual/canal `MANUAL`) quanto pelo
  `envio-whatsapp.service.ts` (011, editado) logo após um envio bem-sucedido dentro de um
  atendimento: cria a `Interacao` de saída (ou reaproveita a já criada pela 011) +
  `RespostaAtendimento` + marca `primeiraRespostaEm` se ainda não marcado.

Nenhuma das duas portas é exposta por HTTP diretamente — são consumidas só internamente
pelo `crm`, mesmo padrão da 009 (`RegistrarInteracaoService`) sendo consumida pela 011.
