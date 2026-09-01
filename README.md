# Projeto Pandora

Sistema de dados da **Amor em Nutrir (AEN)** — empresa de educação e infoprodutos para
nutricionistas. O Pandora consolida, **sem duplicidade**, num único PostgreSQL, tudo o que
acontece nas vendas da AEN, e serve esses dados para o time por uma API interna e um painel.

Este repositório é a **reconstrução** do sistema (v2). A v1 foi construída em 11 features
incrementais, funciona e está validada contra produção, mas foi modelada reativamente. A v2
reparte o domínio em contextos delimitados e fixa as regras que não podem mudar.

## O problema que ele resolve

A AEN vende os mesmos produtos por **4 plataformas de checkout/pagamento** — TMB Educação,
Asaas, Guru e Hotmart — divididas em **7 contas de origem** (`TMB`, `Asaas PRD/SVC`,
`Guru PRD/SVC`, `Hotmart PRD/SVC`), cada uma com seu modelo de dados. Uma única venda pode
aparecer em duas plataformas (a Guru terceiriza cobrança para a Asaas) e algumas vendas
Hotmart são feitas como afiliada de terceiros. Sem tratamento, isso vira contagem dupla de
receita e clientes/contratos fantasma.

O Pandora normaliza tudo para um modelo canônico e mantém quatro visões consistentes:

1. **Transações** — todo pagamento, venda, reembolso e chargeback das 7 contas.
2. **Clientes** — pessoa física/jurídica compradora, deduplicada entre plataformas.
3. **Catálogo** — Produto → Oferta, curado internamente.
4. **Contratos** — o vínculo cliente↔produto com estado de acesso, valor e histórico.

## Frentes do projeto

| Frente | O que faz |
| --- | --- |
| **Financeiro** | Ingestão das 7 contas, ledger canônico, reconciliação, receita por moeda. Base já existente, sendo reconstruída. |
| **CRM** | WhatsApp (chat + disparos), pipeline de vendas de alto ticket, automações (Workflow), FAQ com apoio de IA, dashboard comercial. |
| **Marketing** | "Git do marketing": lançamentos e perpétuo versionados de forma imutável, diff visual campo a campo, notificação ao Slack na publicação. |
| **Central de Clientes** | Read model (BFF) **e** portal que a própria aluna acessa: LGPD, preferências de comunicação, histórico de contratos e economia, recomendações. |

> **Ordem de construção acordada:** CRM → Financeiro → Marketing → Central de Clientes.

## Princípios de arquitetura

Detalhe completo em [`.specify/memory/constitution.md`](.specify/memory/constitution.md).

1. **Modelar o domínio, não a origem.** ID surrogate opaco (UUID v7) em toda entidade;
   identificadores de plataforma vão para tabelas de alias, nunca como chave primária.
2. **Clarificar antes de assumir (não-negociável).** Toda dúvida de negócio vai ao dono do
   produto antes de virar código.
3. **Bordas finas, núcleo canônico.** Cada integração converte para/de um modelo canônico;
   nenhuma regra de negócio conhece "Guru" ou "Asaas".
4. **Ingestão como log de eventos + projeções.** O evento cru imutável é a fonte de verdade;
   tudo o mais é derivado e reconstruível. Reprocessar é sempre seguro.
5. **Tudo que é agregado é derivado.** Receita, valor recebido, estado de contrato e toda
   métrica são funções sobre eventos, nunca contadores incrementais.
6. **Contextos delimitados.** Comunicação por eventos ou API interna; um contexto observa o
   outro, nunca escreve no banco dele.
7. **Curadoria e derivação nunca se sobrescrevem.** Campo curado e campo derivado são
   colunas diferentes; a leitura decide a precedência.
8. **Superfície de escrita mínima.** Poucos recursos aceitam escrita; nenhuma sincronização
   automática com API externa — só sob demanda, com confirmação.

### Padrões transversais

- **Dinheiro:** inteiro com escala × 10000, sempre com moeda; `float` proibido; nunca soma
  moedas diferentes.
- **Tempo:** `timestamptz` em UTC em todo lugar.
- **Status:** um enum canônico rico; "libera acesso?" e "conta como receita?" são funções
  puras dele; status desconhecido vai para fila de revisão.
- **LGPD:** exclusão de pessoa é pseudonimização — os agregados financeiros permanecem
  íntegros sem reter PII.

## Stack

- **Backend:** Node.js · TypeScript · NestJS · Prisma · PostgreSQL
- **Frontend:** React 19 · TypeScript · Vite · Tailwind v4 · TanStack Query · React Router
- **Auth:** um único nível de acesso de serviço (`POST /auth/token` → JWT)

O backend da v1 era Python/FastAPI; a v2 migra para Node.js/TypeScript (TS ponta a ponta com
o frontend; os módulos do NestJS mapeiam os contextos). O código e os testes da v1 não são
reaproveitados — a validação vem da re-ingestão do histórico real das 7 contas.

## Estrutura do repositório

```
src/
  ingestao/    adapters/{tmb,asaas,guru,hotmart}/{webhook,csv,api} + evento_origem + worker
  financeiro/  transacao, vinculo, receita (queries), reconciliacao
  catalogo/    produto, oferta, oferta_catalogo, janela_lancamento, resolucao
  contratos/   contrato, aditivo, fold (recálculo puro), acesso
  clientes/    pessoa, conta, identidade (dedup), merge
  crm/         interacao, oportunidade, pipeline, tarefa, nota, tag, lead, workflow, faq
  marketing/   campanha, artefato, versao_campo (diff), tratamento_cliente, atribuicao
  central/     composição read-model + comandos
  core/        dinheiro, tempo, ids, status_canonico, auditoria, config
  api/         routers finos por contexto
  admin/       sync sob demanda, imports CSV, curadoria

tests/         unit, contract, integration (contra Postgres real com dados de produção)
specs/         uma pasta por feature: spec.md, plan.md, tasks.md, contracts/
.specify/      constituição, templates e workflow do Spec Kit
```

## Fluxo de desenvolvimento

O projeto segue o processo **Spec Kit**:

```
constitution  →  specify  →  clarify  →  plan  →  tasks  →  implement
```

Cada feature vive em `specs/<###-nome>/`. O `plan` inclui um **Constitution Check** como
portão de qualidade. Nenhuma feature avança para `tasks` com uma decisão de negócio em
aberto.

## Estratégia de migração

Não se migra dado tabela a tabela. O ativo real é o histórico de transações: re-ingere-se a
partir dos payloads crus e das exportações CSV das 7 contas para o novo `evento_origem`, e
as projeções se reconstroem — validando o pipeline novo contra 100% do volume real de uma
vez. A v1 é congelada (somente leitura) durante o corte, e os agregados-chave (receita por
conta/mês/moeda, contratos ativos, clientes) têm que bater. Só o catálogo curado é migrado
de verdade, pelos endpoints de curadoria da v2.

## Documentação

- [`Projeto_Pandora_-_Visão_geral_para_refatoração.md`](Projeto_Pandora_-_Visão_geral_para_refatoração.md)
  — briefing único e autossuficiente do escopo (Partes 1–10).
- [`.specify/memory/constitution.md`](.specify/memory/constitution.md) — princípios de
  governança (v1.0.0).
- [`CLAUDE.md`](CLAUDE.md) — contexto de trabalho para agentes de IA.
- `Documentação {Asaas,Guru,Hotmart,TMB}.md` — referência das APIs de origem.

## Status

Reconstrução em fase de definição. Constituição ratificada em 2026-09-01 (v1.1.0). A maior
parte das decisões em aberto da Parte 7 da visão foi resolvida (stack, granularidade de
Contrato e Oferta, resolução Hotmart, moeda, fontes de Marketing, política de atualização).

Ordem de construção acordada: **CRM → Financeiro → Marketing → Central de Clientes**.
Próximo passo: abrir a primeira spec (`speckit-specify`) para as fundações transversais
(`core`, `pessoa`/identidade, `evento_origem`) e o CRM. Restam em aberto o default do modelo
de atribuição de Marketing e as decisões específicas de CRM (visão Parte 8.12).
