# Data Model: Vínculo Asaas↔Guru (pipeline etapa 4)

## `Transacao` (spec 018, estendida — 2 campos novos + FK ativada)

| Campo | Tipo | Notas |
|---|---|---|
| `referenciaExternaIdOrigem` | `String?` (`@map("referencia_externa_id_origem")`) | **novo**. Cru — `EventoCanonico.referenciaExterna.idOrigem`, gravado por `UPSERT_TRANSACAO` (etapa 3) independente de plataforma. `null` para toda transação sem referência externa. |
| `transacaoVinculadaId` | `String?` (`@db.Uuid`) | já existia (018, coluna nua). **Esta spec ativa a `@relation`** para `Transacao` (self-relation) — `onDelete: SetNull`. Preenchido só na transação **Asaas** do par, apontando para a **Guru**. |
| `classificacao` | `Classificacao` | já existia. Esta spec é quem grava `COBRANCA_TERCEIRIZADA` de fato (etapa 1/`classificar.ts` já reserva o valor no enum, mas nunca o atribui — só marca `DESCONHECIDO`+`revisar` quando há `referenciaExterna.plataforma` explícita, caso que o adapter Asaas nunca produz). |

Índice novo: `@@index([plataformaOrigem, referenciaExternaIdOrigem])` — usado pela busca "Asaas
pendente esperando a Guru X" (papel Guru, D-03) e pela varredura de
`/tentar-vincular-pendentes` (papel Asaas pendente). Sem `@@unique` aqui — várias transações
Asaas históricas *poderiam*, em teoria, carregar acidentalmente o mesmo `externalReference`
(dado de origem, não garantido pelo nosso sistema); a unicidade do vínculo em si é garantida
por `vinculo_transacao` (abaixo), não por esta coluna.

## `VinculoTransacao` (nova)

Representa 1 par resolvido `(transação Guru, transação Asaas)`. Imutável — nunca `UPDATE`
(Princípio VII), sem `DELETE` (reversão é escopo da spec 027).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` `@id @db.Uuid` | UUID v7, gerado na app (padrão do projeto). |
| `transacaoGuruId` | `String @db.Uuid` | FK → `Transacao.id`. `@unique` — 1 Guru vincula no máximo 1 Asaas. |
| `transacaoAsaasId` | `String @db.Uuid` | FK → `Transacao.id`. `@unique` — 1 Asaas vincula no máximo 1 Guru. |
| `origemRef` | `String` | o valor cru que casou (`referenciaExterna.idOrigem` = `id_origem` da Guru) — guardado mesmo que `transacao.referencia_externa_id_origem` já carregue o mesmo valor, para o registro ficar autocontido/auditável mesmo se a coluna da transação for tocada por outra spec no futuro. |
| `resolvidoEm` | `DateTime @db.Timestamptz(6)` | `agoraUtc()` do core — instante em que o vínculo foi cravado (pipeline ou retry manual). |
| `criadoEm` | `DateTime @default(now()) @db.Timestamptz(6)` | auditoria padrão do projeto. |

Relations: `transacaoGuru Transacao @relation("VinculoGuru", fields: [transacaoGuruId], ...)`,
`transacaoAsaas Transacao @relation("VinculoAsaas", fields: [transacaoAsaasId], ...)` — 2
nomes de relação distintos porque ambas as FKs apontam para o mesmo model `Transacao`
(precedente: nenhum ainda no projeto tinha 2 FKs pro mesmo model — primeira vez; nome de
relação explícito evita ambiguidade do Prisma).

`onDelete`: `Restrict` em ambas as FKs — uma `Transacao` nunca é fisicamente apagada no
projeto (Princípio de dado imutável/append-only geral), então isto é só uma garantia extra
contra uma futura spec que precise apagar transação por engano quebrar um vínculo silenciosamente.

## Validação / regras de escrita

- `VinculoTransacao` só é criado por `TentarVincularService` (usado tanto pelo executor da
  etapa 4 quanto pelos 2 endpoints de retry) — nenhuma outra via de escrita.
- Antes de criar, o serviço verifica (na mesma transação de banco) que nem
  `transacaoGuruId` nem `transacaoAsaasId` já têm vínculo — se algum já tem, é no-op
  idempotente (retorna o vínculo existente, não cria um 2º).
- A reclassificação de `classificacao` para `COBRANCA_TERCEIRIZADA` e o `UPDATE` de
  `transacaoVinculadaId` acontecem na **mesma transação de banco** que o `INSERT` de
  `VinculoTransacao` (atomicidade — nunca um `vinculo_transacao` órfão sem o campo espelhado
  em `transacao`, nem vice-versa).

## Estado derivado (sem coluna nova)

- **"Pendente de vínculo"** = `plataformaOrigem IN (ASAAS_PRD, ASAAS_SVC) AND
  referenciaExternaIdOrigem IS NOT NULL AND transacaoVinculadaId IS NULL`. Usado pelo filtro
  de listagem (FR-009) e pela varredura de `/tentar-vincular-pendentes`.
- **"Conta como receita" (`pagoDeFato`)** = `contaComoReceita(statusCanonico) &&
  classificacao !== 'COBRANCA_TERCEIRIZADA'` (função pura `pagoDeFatoTransacao`,
  `financeiro/domain/vinculo/receita.ts`).
