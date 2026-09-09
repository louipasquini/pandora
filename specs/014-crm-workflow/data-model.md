# Data Model — 014-crm-workflow

Todas as entidades novas vivem no bounded context `crm`. IDs surrogate UUID v7, gerados na
app (`EntidadeId.novo()`). Nenhum identificador de origem externa nesta spec.

## Enums

### `FluxoGatilhoTipo`

```
LEAD_CRIADO
LEAD_ESTAGIO_MUDOU
OPORTUNIDADE_ETAPA_MUDOU
INTERACAO_REGISTRADA
TAG_APLICADA
EVENTO_EXTERNO
```

Os 5 primeiros são gatilhos internos, detectados pelo worker (D-02 em plan.md). O último
(`EVENTO_EXTERNO`) é só modelado — nunca aparece como `fonte` de uma `execucao_fluxo` nesta
versão (CL-01, D-R8).

### `FluxoVersaoStatus`

```
RASCUNHO   — editável livremente, nunca executa
PUBLICADA  — imutável, no máximo 1 por fluxo, elegível para execução
ARQUIVADA  — imutável, histórico, não executa mais
```

### `FluxoRegistroTipo`

```
LEAD
OPORTUNIDADE
```

Ver D-R4 (research.md) — nenhum gatilho interno resolve `PESSOA` nesta versão.

### `FluxoExecucaoResultado`

```
EXECUTADA               — condição satisfeita, todas as ações aplicadas (ou nenhuma configurada)
CONDICAO_NAO_SATISFEITA — condição avaliada como falsa, nenhuma ação rodou
FALHOU                  — condição satisfeita, mas ao menos uma ação falhou
```

## Entidades

### `FluxoAutomacao`

A automação em si — só metadado estável; todo o conteúdo executável vive nas versões.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID v7 | PK |
| `nome` | string | |
| `descricao` | string? | |
| `criadoPor` | string? | livre, mesmo padrão de `faq_item_versao.autor`/`crm_admin_audit.autor` — a credencial de serviço não é `Usuario` |
| `criadoEm` / `atualizadoEm` | timestamptz | |

Sem `DELETE` físico — um fluxo indesejado se arquiva (todas as versões terminam `ARQUIVADA`),
nunca desaparece (mesmo racional de `equipe`/`integracao`, spec 007).

### `FluxoAutomacaoVersao`

Snapshot completo e imutável de gatilho + condições + ações — a unidade real de execução.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID v7 | PK |
| `fluxoId` | UUID | FK `FluxoAutomacao`, `onDelete: Cascade` |
| `numero` | int | sequencial por fluxo, `@@unique([fluxoId, numero])` |
| `status` | `FluxoVersaoStatus` | default `RASCUNHO` |
| `gatilhoTipo` | `FluxoGatilhoTipo` | |
| `condicoes` | jsonb | árvore `CondicaoNo` (ver contracts/workflow.md) — `{tipo:'grupo', operador:'E', itens:[]}` = sempre verdadeiro |
| `acoes` | jsonb | array de `AcaoFluxo` (ver contracts/workflow.md), ordem de execução = ordem do array |
| `autor` | string? | quem editou este rascunho pela última vez |
| `publicadoPor` | string? | preenchido só ao publicar |
| `publicadoEm` | timestamptz? | |
| `arquivadoPor` | string? | preenchido ao arquivar (via publicação de outra versão ou via `POST .../arquivar`) |
| `arquivadoEm` | timestamptz? | |
| `criadoEm` / `atualizadoEm` | timestamptz | |

Restrições:
- `@@unique([fluxoId, numero])`.
- Índice único **parcial** `(fluxo_id) WHERE status = 'PUBLICADA'` — SQL bruto na migração
  (D-01; garante no máximo 1 versão publicada por fluxo, sem depender de lógica de aplicação).
- Editar um `RASCUNHO` faz `UPDATE` in-place (mesma `numero`) — só publicar "congela" o
  conteúdo definitivamente; a partir daí, qualquer edição cria uma nova linha com
  `numero + 1`.

### `ExecucaoFluxo`

Histórico append-only de toda tentativa de execução — a fonte de verdade para US5 (consultar
histórico) e para a idempotência (D-06).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID v7 | PK |
| `fluxoVersaoId` | UUID | FK `FluxoAutomacaoVersao`, `onDelete: Cascade` |
| `fonte` | `FluxoGatilhoTipo` | de qual trilha veio (nunca `EVENTO_EXTERNO`) |
| `fonteRegistroId` | UUID | id da linha de origem na trilha-fonte (`crm_lead_audit.id` / `oportunidade_movimentacao.id` / `interacao.id` / `tag_associacao.id`) |
| `registroTipo` | `FluxoRegistroTipo` | |
| `registroId` | UUID | id do lead/oportunidade afetado |
| `resultado` | `FluxoExecucaoResultado` | |
| `acoesAplicadas` | jsonb | array `{tipo, status:'aplicada'\|'falhou', detalhe?}`, na ordem configurada |
| `erroDetalhe` | string? | motivo da 1ª ação que falhou, quando `resultado = FALHOU` |
| `ocorridoEm` | timestamptz | quando o evento de origem aconteceu (o `criadoEm` da linha-fonte) |
| `criadoEm` | timestamptz | quando o worker processou (default `now()`) |

Restrições:
- `@@unique([fluxoVersaoId, fonte, fonteRegistroId])` — a chave de idempotência (D-06); uma
  segunda tentativa de processar a mesma linha-fonte para a mesma versão é simplesmente
  pulada pelo worker (linha já existe).
- `@@index([registroTipo, registroId, criadoEm])` — histórico "o que já rodou para este
  lead/oportunidade".
- `@@index([fluxoVersaoId, criadoEm])` — histórico "o que já rodou para este fluxo" (US5).
- Append-only — sem `PATCH`/`DELETE`.

### `FluxoModelo`

Biblioteca de automações prontas (CL-02) — só leitura para o usuário; escrita só via
`prisma/seed.ts`.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID v7 | PK |
| `nome` | string | |
| `descricao` | string? | |
| `gatilhoTipo` | `FluxoGatilhoTipo` | |
| `condicoes` | jsonb | mesmo formato de `FluxoAutomacaoVersao.condicoes` |
| `acoes` | jsonb | mesmo formato de `FluxoAutomacaoVersao.acoes` |
| `criadoEm` | timestamptz | |

Sem `atualizadoEm`/versão — imutável por natureza (só o seed escreve). Sem `DELETE` exposto
por endpoint algum.

### `FluxoCursorFonte`

Estado técnico do worker — não é dado de negócio, não aparece em nenhuma tela de usuário além,
no máximo, de um painel de observabilidade futuro.

| Campo | Tipo | Notas |
|---|---|---|
| `fonte` | `FluxoGatilhoTipo` | PK — só as 5 fontes realmente varridas (D-R8) |
| `ultimoCriadoEm` | timestamptz | `criadoEm` da última linha-fonte processada |
| `ultimoId` | UUID | id da última linha-fonte processada (desempate de `criadoEm` igual) |
| `atualizadoEm` | timestamptz | `@updatedAt` |

Sem linha para uma fonte = "nunca varrida ainda" — a 1ª passada **não processa nada**, só
grava o cursor em "agora" (research.md D-R9); a partir da 2ª passada em diante, varre só o
que foi criado depois desse instante. Publicar um fluxo nunca reage retroativamente ao
histórico já existente daquela trilha.

## Relação com entidades já existentes (sem FK nova nelas)

Nenhuma tabela já existente (`Lead`, `Oportunidade`, `Interacao`, `TagAssociacao`,
`CrmLeadAudit`, `OportunidadeMovimentacao`) ganha coluna nova. O Workflow **lê** essas tabelas
(trilhas-fonte e estado atual do registro) e **escreve** nelas só através dos serviços já
existentes (`LeadRepository`/`CrmLeadAuditService`, `TagService`, `RegistrarInteracaoService`,
`MovimentacaoRepository`) — nunca por FK direta de `ExecucaoFluxo` para `Lead`/`Oportunidade`
(o par `registroTipo` + `registroId` é suficiente para o histórico, sem exigir uma FK
polimórfica ou duas colunas nullable com `CHECK` de exclusividade como em `Interacao`/
`Oportunidade`/`Atendimento` — aqui não há necessidade de integridade referencial forte porque
`ExecucaoFluxo` é só log, não uma âncora que outra entidade referencia de volta).

## Diagrama de estados — `FluxoAutomacaoVersao.status`

```
        criar fluxo / editar após publicar
                    │
                    ▼
              ┌───────────┐
       ┌─────▶│ RASCUNHO  │◀────┐ PUT .../rascunho (in-place, mesma versão)
       │      └─────┬─────┘     │
       │            │ POST publicar (válido)
       │            ▼
       │      ┌───────────┐   POST .../arquivar   ┌───────────┐
       │      │ PUBLICADA │───────────────────────▶│ ARQUIVADA │
       │      └─────┬─────┘                        └───────────┘
       │            │ POST publicar de OUTRO rascunho
       │            ▼
       │      ┌───────────┐
       └──────│ ARQUIVADA │ (a versão anterior, arquivada automaticamente)
              └───────────┘
```
