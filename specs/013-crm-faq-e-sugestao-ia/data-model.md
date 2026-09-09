# Data Model — 013-crm-faq-e-sugestao-ia

5 tabelas novas + 2 enums novos. 3 tabelas no bounded context `crm` (`faq_item`,
`faq_item_versao`, `sugestao_ia`, já não-vazio desde 007–012); 2 tabelas no bounded context
`clientes` (`campo_personalizado_pessoa`, `valor_campo_pessoa`, espelhando
`campo_personalizado_lead`/`valor_campo_lead` da 008 campo a campo). 1 coluna nova em
`resposta_atendimento` (`sugestao_ia_id`). PK `id` UUID v7 gerado na aplicação (`uuidv7()` do
`core`), `@db.Timestamptz(6)` em todo timestamp. **Nenhuma tabela de auditoria genérica
nova** — `faq_item_versao` é histórico de 1ª classe (research.md D-R1); `sugestao_ia` já é,
por natureza, um registro de decisão (não precisa de `crm_admin_audit`); a credencial de IA
reaproveita `integracao`/`crm_admin_audit` já existentes (D-R4), sem tabela própria.

## Enums

```
SugestaoIaTipo    RESPOSTA | CAMPO_PERSONALIZADO
SugestaoIaStatus  PENDENTE | ACEITA | REJEITADA | SUBSTITUIDA
```

`SUBSTITUIDA` é o estado de uma sugestão `PENDENTE` que foi superada por um novo pedido de
sugestão para a mesma mensagem de origem (D-05) — nunca uma decisão humana, por isso
`decididoPorId` permanece `null` nesse caso (só `decididoEm` é preenchido).

## `FaqItem`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid | PK |
| `pergunta` | string | espelha sempre a versão mais recente (denormalizado para leitura rápida) |
| `resposta` | string | idem |
| `ativo` | boolean | default `true` — só itens ativos entram na busca da IA (FR-001/FR-006) |
| `criadoEm`/`atualizadoEm` | datetime | — |

- `@@index([ativo])` — filtro da busca da IA e do catálogo `GET /crm/faq`.
- Sem `DELETE` físico — desativar é a única forma de "remover" (FR-001, cenário 3); histórico
  de versões permanece íntegro mesmo depois de desativado.
- Sem coluna "quem criou" — a 1ª `FaqItemVersao` já guarda isso, sem duplicar o dado.

## `FaqItemVersao`

Histórico **append-only** de 1ª classe — 1 linha por criação/edição, snapshot completo
(research.md D-R1), não *diff*.

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid | PK |
| `faqItemId` | uuid | FK `FaqItem`, `onDelete: Cascade` |
| `pergunta` | string | snapshot no momento desta versão |
| `resposta` | string | idem |
| `autor` | string? | **string livre, não FK** — mesmo padrão de `crm_admin_audit.autor` (007): quem edita FAQ pode ser a credencial de serviço, cujo `sub` não é um `Usuario.id` real |
| `criadoEm` | datetime | quando |

- `@@index([faqItemId, criadoEm])` — histórico em ordem.
- Sem `PATCH`/`DELETE` — append-only puro.

## `SugestaoIa`

Proposta não-autoritativa da IA — nasce sempre a partir de uma `Interacao` de entrada já
registrada, dentro de um `Atendimento` já existente (research.md D-R2/D-03).

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid | PK |
| `atendimentoId` | uuid | FK `Atendimento`, `onDelete: Cascade` |
| `interacaoOrigemId` | uuid | FK `Interacao`, `onDelete: Restrict` — a mensagem que originou esta sugestão |
| `tipo` | `SugestaoIaTipo` | `RESPOSTA` \| `CAMPO_PERSONALIZADO` |
| `perguntaDetectada` | string? | trecho da mensagem que a IA identificou como a pergunta específica (US3 — múltiplas perguntas na mesma mensagem geram múltiplas linhas, uma por pergunta) |
| `faqItemId` | uuid? | FK `FaqItem`, `onDelete: Restrict` — item de FAQ usado como base; `null` se `tipo=CAMPO_PERSONALIZADO` ou se a IA não encontrou correspondência (sugestão de conteúdo livre, sem base — ver nota abaixo) |
| `campoPersonalizadoLeadId` | uuid? | FK `CampoPersonalizadoLead`, `onDelete: Restrict` — preenchido sse `tipo=CAMPO_PERSONALIZADO` e o atendimento é de um `lead` |
| `campoPersonalizadoPessoaId` | uuid? | FK `CampoPersonalizadoPessoa`, `onDelete: Restrict` — preenchido sse `tipo=CAMPO_PERSONALIZADO` e o atendimento é de uma `pessoa` |
| `conteudoSugerido` | string | texto de resposta proposto, ou valor de campo proposto (serializado como string, mesma convenção de `ValorCampoLead.valor`) |
| `conteudoFinal` | string? | valor efetivamente decidido — pode divergir de `conteudoSugerido` se o atendente editou antes de aceitar (US2/US4); `null` enquanto `PENDENTE`/`SUBSTITUIDA` |
| `status` | `SugestaoIaStatus` | default `PENDENTE` |
| `decididoPorId` | uuid? | FK `Usuario`, `onDelete: Restrict` — `null` quando `SUBSTITUIDA` (decisão do sistema, não humana) |
| `decididoEm` | datetime? | — |
| `util` | boolean? | feedback opcional pós-decisão (US5); `null` = sem avaliação |
| `utilRegistradoPorId` | uuid? | FK `Usuario`, `onDelete: Restrict` |
| `utilRegistradoEm` | datetime? | — |
| `criadoEm` | datetime | — |

- `@@index([atendimentoId, criadoEm])` — painel de sugestões de um atendimento.
- `@@index([interacaoOrigemId, status])` — encontrar a(s) pendente(s) da mesma mensagem para
  aplicar D-05 (substituição) num novo pedido.
- `CHECK` de exclusividade do alvo, via SQL bruto na migração (Prisma não modela `CHECK`,
  mesmo padrão 007/009/010/012):
  - `tipo = 'CAMPO_PERSONALIZADO'` → exatamente um de `campo_personalizado_lead_id` /
    `campo_personalizado_pessoa_id` preenchido (`num_nonnulls(...) = 1`).
  - `tipo = 'RESPOSTA'` → os dois `NULL`.
- Nota sobre `faqItemId` nulo com `tipo=RESPOSTA`: a IA pode, em tese, propor uma resposta
  sem se basear em nenhum item específico de FAQ (ex.: uma pergunta genérica cuja resposta
  ela infere do contexto da conversa) — permitido pelo schema, mas o prompt (`montarPrompt`,
  domínio) instrui a IA a preferir sempre basear-se em FAQ ativa quando existir cobertura, e
  a **não** propor nada quando não houver base razoável (FR-006) — a ausência de proposta
  (lista vazia) é o caminho normal para "sem correspondência", não uma sugestão com
  `faqItemId=null` de baixa confiança.
- Sem `DELETE` — decisão (`ACEITA`/`REJEITADA`) e substituição (`SUBSTITUIDA`) são estados
  permanentes e consultáveis (FR-016, SC-005).

## `RespostaAtendimento` (editada — spec 012)

| Campo novo | Tipo | Notas |
| --- | --- | --- |
| `sugestaoIaId` | uuid? | FK `SugestaoIa`, `onDelete: SetNull`, **`@unique`** — liga esta resposta enviada à sugestão `ACEITA`/`tipo=RESPOSTA` que a originou, quando houve uma (FR-012). `null` para respostas manuais. `@unique` garante que uma mesma sugestão nunca é "usada" por 2 respostas diferentes. |

Nenhum outro campo de `RespostaAtendimento` muda; o contrato append-only já validado pela 012
permanece intacto (sem `PATCH`/`DELETE`).

## `CampoPersonalizadoPessoa` (bounded context `clientes`)

Espelha `CampoPersonalizadoLead` (008) campo a campo — mesma estrutura de definição
administrável, namespace de `chave` **independente** do de `CampoPersonalizadoLead` (sem
unificação automática entre os dois — ver Assumptions do `spec.md`).

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid | PK |
| `chave` | string | `@unique` — slug estável, imutável após criado |
| `rotulo` | string | — |
| `tipo` | `CampoPersonalizadoTipo` | reaproveita o enum já existente (008) — `TEXTO\|NUMERO\|BOOLEANO\|DATA\|SELECAO` |
| `opcoes` | string[] | default `[]` — só relevante para `tipo=SELECAO` |
| `obrigatorio` | boolean | default `false` |
| `ativo` | boolean | default `true` |
| `criadoEm`/`atualizadoEm` | datetime | — |

## `ValorCampoPessoa` (bounded context `clientes`)

Espelha `ValorCampoLead` (008).

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid | PK |
| `pessoaId` | uuid | FK `Pessoa`, `onDelete: Cascade` |
| `definicaoId` | uuid | FK `CampoPersonalizadoPessoa`, `onDelete: Restrict` |
| `valor` | string | validado por `tipo` na borda (mesmo `zod` refinado usado por `ValorCampoLead`) |
| `criadoEm`/`atualizadoEm` | datetime | — |

- `@@unique([pessoaId, definicaoId])`.
- `@@index([definicaoId])`.

## Fluxo — gerar e decidir uma sugestão

```
Interacao (entrada, já registrada)
        │  POST /crm/atendimentos/:id/sugestoes { interacaoId }
        ▼
montarPrompt(mensagem, faqAtiva, definicoesCampo) ──▶ SugestaoIaClient.gerarSugestoes(prompt)
        │                                                        │
        │                                          interpretarRespostaIa(bruto)
        ▼                                                        │
D-05: sugestões PENDENTE anteriores da mesma interacaoOrigemId ◀──┘
      → SUBSTITUIDA
        │
        ▼
N linhas SugestaoIa PENDENTE (tipo RESPOSTA | CAMPO_PERSONALIZADO)
        │
        ├─ tipo=RESPOSTA ──▶ POST .../aceitar (status=ACEITA, sem enviar) ──▶
        │                    POST /crm/atendimentos/:id/responder { sugestaoId } ──▶
        │                    RespostaAtendimento{ viaIa: true, sugestaoIaId }
        │
        └─ tipo=CAMPO_PERSONALIZADO ──▶ POST .../aceitar (grava direto)
                                          ├─ âncora lead   → ValorCampoLeadService (008, direto)
                                          └─ âncora pessoa → PortaCampoPersonalizadoPessoa (porta)
```
