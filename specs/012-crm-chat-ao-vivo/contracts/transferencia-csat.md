# Contrato — Transferência e CSAT

## `POST /crm/atendimentos/:id/transferir`

`atendimento:transferir`. Body — um de `paraAtendenteId` **ou** `paraEquipeId` (ou ambos:
"para este atendente, e passa a valer como da equipe X"):

```json
{ "paraAtendenteId": "...", "motivo": "cliente pediu para falar com financeiro" }
```

Fluxo:

1. `status = ENCERRADO` → **409** `{erro: 'atendimento_encerrado'}`.
2. Grava `TransferenciaAtendimento` (`deAtendenteId`/`deEquipeId` = estado atual antes da
   mudança; `paraAtendenteId`/`paraEquipeId`/`motivo`/`transferidoPorId = sujeito`).
3. `paraAtendenteId` presente → atribuição direta (`atendenteAtualId = paraAtendenteId`,
   `status = EM_ATENDIMENTO`); **nenhuma verificação de expediente/carga** — transferência é
   uma ação explícita de quem já está atendendo, não uma nova rodada de endereçamento
   automático (edge case do spec.md).
4. Só `paraEquipeId` presente (sem atendente específico) → reaplica
   `escolherAtendentePorCarga` (mesma função de FR-004) restrito aos membros ativos dessa
   equipe em expediente agora; achou → atribuição + `EM_ATENDIMENTO`; não achou →
   `atendenteAtualId = null`, `status = AGUARDANDO` (entra na fila dessa equipe, FR-009).
5. Sucesso → **201** `{ transferenciaId, atendimento: AtendimentoView }`.

A timeline (`GET /crm/atendimentos/:id/timeline`) não é tocada por esta operação — nenhuma
`Interacao` é criada, movida ou duplicada (SC-003).

## `GET /crm/atendimentos/:id/transferencias`

Escopo de leitura do atendimento (`ver_todos`\|`ver_proprios`). Lista
`TransferenciaAtendimento` em ordem cronológica (histórico append-only, FR-008).

## CSAT

### `POST /crm/atendimentos/:id/csat`

`atendimento:atender` (lançamento manual — ex.: nota dada por telefone e transcrita pelo
atendente). Body:

```json
{ "nota": 9, "comentario": "Atendimento rápido, resolveu na hora" }
```

1. `csatElegivel(atendimento, jaTemResposta)` (D-R5) falso → **409**
   `{erro: 'nao_elegivel_para_csat'}` (atendimento não encerrado, `csatSolicitadoEm` nulo,
   ou já respondido).
2. `nota` fora de 0–10 ou não-inteiro → **422**.
3. Cria `Interacao` (`tipo: NPS`, `notaNps: nota`, `conteudo: comentario ?? '(sem
   comentário)'`, `atendimentoId: :id`, mesma âncora do atendimento) → **201**
   `{ interacaoId }`.
4. Segunda tentativa (já existe `Interacao tipo NPS` para este atendimento) → **409**
   `{erro: 'csat_ja_registrado'}` (SC-004).

### Captura automática (WhatsApp, sem endpoint dedicado)

Documentado aqui porque é parte do mesmo contrato de negócio, mas **não é uma rota nova** —
acontece dentro do processamento já existente do webhook (011, editado): ao receber uma
mensagem, se há um `Atendimento ENCERRADO` recente para a mesma âncora+canal, elegível para
CSAT (`csatElegivel`), e `interpretarRespostaCsat(textoRecebido)` devolve um número, a
mensagem vira a `Interacao tipo NPS` do passo 3 acima em vez de um `WHATSAPP` comum — mesmo
efeito do `POST /csat` manual, mesma idempotência (2ª nota nunca sobrescreve a 1ª). Texto
que não interpreta como nota segue o fluxo normal de mensagem (pode inclusive reabrir um
atendimento novo, se a conversa continuar).

## Configuração administrativa (SLA / mensagem fora do expediente)

### `PATCH /crm/admin/atendimento/equipes/:equipeId`

`crm_admin:gerir_atendimento`. Body parcial:

```json
{ "slaPrimeiraRespostaMinutos": 15, "mensagemForaExpediente": "Nossa equipe volta às 9h!" }
```

`equipeId` que não é `tipo = ATENDIMENTO` → **422** `{erro: 'equipe_nao_e_de_atendimento'}`.
Audita em `crm_admin_audit` (reuso — configuração administrativa, mesmo padrão 007/011).

### `GET /crm/admin/atendimento/equipes/:equipeId`

`crm_admin:ver`. Devolve `{ slaPrimeiraRespostaMinutos, mensagemForaExpediente }` (`null` =
usa o default global).
