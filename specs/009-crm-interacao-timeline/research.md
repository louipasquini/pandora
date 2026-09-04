# Phase 0 — Research: 009-crm-interacao-timeline

## 1. Timeline unificada da pessoa: `OR`/`JOIN` numa query só, sem N+1

**Decisão**: `InteracaoRepository.listarPorPessoa(pessoaId)` usa um único
`prisma.interacao.findMany({ where: { OR: [{ pessoaId }, { lead: { pessoaId } }] }, orderBy:
{ ocorridoEm: 'desc' }, include: { lead: { select: { id: true, nome: true } } } })`. O Prisma
traduz isso num `SELECT ... LEFT JOIN lead ON interacao.lead_id = lead.id WHERE
interacao.pessoa_id = $1 OR lead.pessoa_id = $1` — uma consulta, um índice em
`lead(pessoa_id)` (já existe desde a 008) e um em `interacao(pessoa_id)`/`interacao(lead_id)`
(novos). Paginação por `cursor`/`take` como as demais listagens do projeto.

**Alternativas rejeitadas**:
- Duas queries (`pessoa_id = :id` + outra por `lead_id IN (...)`) unidas na aplicação — mais
  round-trips, paginação fica difícil de compor corretamente entre as duas fontes.
- Materializar a união numa tabela/view — contraria a regra 8.2.2 (derivado, não persistido)
  e o Princípio V; a timeline muda a cada conversão de lead sem nenhum evento explícito para
  disparar a materialização.

## 2. `CHECK` de exclusividade de âncora via SQL bruto na migração

**Decisão**: o Prisma **não** modela `CHECK constraint` nativamente (sem
`@@check`/`db.Check`). Duas colunas nullable (`pessoa_id`, `lead_id`) MUST ter exatamente
uma preenchida — garantido por `CHECK (num_nonnulls(pessoa_id, lead_id) = 1)` anexado à
`migration.sql` gerada (`prisma migrate dev` gera o `CREATE TABLE`; o `CHECK` é acrescentado
manualmente antes de commitar, como já foi feito na spec 007 para
`janela_atendimento.hora_fim > hora_inicio`). O mesmo padrão cobre
`tag_associacao (num_nonnulls(lead_id, pessoa_id, interacao_id) = 1)`. A aplicação
**também** valida (função pura `validarAncora`) para dar um erro 422 legível antes de bater
no banco — o `CHECK` é a rede de segurança final, não o caminho principal de erro.

**Alternativas rejeitadas**: confiar só na aplicação (um `INSERT` fora do caminho do
serviço não seria pego); duas tabelas por âncora (duplicaria todo o resto do modelo).

## 3. Por que nenhuma porta nova no `core` (diferente da 008)

A spec 008 precisou de `PortaIdentidade` porque a conversão Lead→Pessoa **chama um serviço
com lógica de negócio** (`ResolverOuCriarService.resolverOuCriar`, que decide, deduplica,
grava) — importar isso violaria o Princípio VI. Esta spec só precisa que `interacao` e
`tag_associacao` **referenciem** `pessoa.id` por FK — não chama nenhuma função de
`src/clientes/**`. O precedente já existe em produção desde a 004/008:
`Lead.responsavelId → usuario.id`, `Lead.pessoaId → pessoa.id` são FKs Prisma que cruzam
contexto sem que `crm` importe `auth`/`clientes`. A fronteira do Princípio VI (e a regra
ESLint `import/no-restricted-paths`) é sobre **import de módulo TypeScript**, não sobre o
`schema.prisma`, que é um arquivo único e compartilhado por design (um banco físico só).
Conclusão: nenhuma interface nova no `core` para esta spec.

## 4. Normalização de tag: centralizada em `crm/domain/tag/`, a 008 passa a importar dali

A 008 já tinha uma função de normalização de tag (`trim`+`lowercase`+espaço→`-`) embutida em
`domain/lead/normalizar-lead.ts`. Esta spec promove essa regra para
`crm/domain/tag/normalizar-tag.ts` (fonte única do slug) — `normalizar-lead.ts` da 008
passa a **importar** dali (mesmo módulo `crm`, sem cruzar contexto, só reorganização
interna). Isso evita duas implementações de "o que é um slug de tag" divergindo.

## 5. `segmento`: esquema fechado por `alvo`, `construirWhere` puro

`filtro-segmento.ts` expõe duas funções puras:
- `validarFiltro(alvo, filtroBruto) → FiltroLead | FiltroPessoa` — schema `zod` fechado
  (`.strict()`) por `alvo`; chave fora do conjunto → `ZodError` → 422 no controller.
- `construirWhere(alvo, filtroValidado) → Prisma.LeadWhereInput | Prisma.PessoaWhereInput`
  — só monta o objeto, não executa. Testável com _snapshot_ simples (entrada → shape
  esperado), sem banco.

`SegmentoService.listarMembros` combina esse `where` com o `where` de escopo de visão
(`AND: [whereDoFiltro, whereDoEscopo]`) antes de chamar `prisma.lead.findMany`/
`prisma.pessoa.findMany` — o filtro do segmento **nunca** substitui o escopo, só restringe
ainda mais.

## 6. Escopo de leitura de timeline por composição de serviço, sem permissão nova

`GET /crm/leads/:leadId/interacoes` chama `LeadConsultaService.obter(leadId, sujeito)`
primeiro (mesmo serviço que `GET /crm/leads/:id` já usa desde a 008) — se o lead está fora
do escopo do sujeito, o próprio `obter` já lança 404 antes de a rota tocar em `interacao`.
Só depois disso a rota busca as interações daquele `leadId`. Isso reusa 100% da lógica de
escopo já testada da 008, sem duplicar regra e sem precisar de uma permissão
`interacao:ver_todos`/`ver_proprios` paralela. `GET /crm/pessoas/:pessoaId/interacoes` segue
o padrão equivalente: `PessoaConsultaService`/repositório da 005 confirma que a pessoa
existe e o guard já exige `pessoa:ver` — sem escopo fino adicional (a 005 não tem
`pessoa:ver_proprios`, só `pessoa:ver`).

## 7. Migração da tag da spec 008: sem _backfill_ de dados

`lead.tags: TEXT[]` é removida na mesma migração que cria `tag`/`tag_associacao`. Não há
dado de produção a preservar (o projeto está na Fase 1 — CRM; a ingestão real das 7 contas só
começa na Fase 2/3), então a migração corta limpo. Ambientes de desenvolvimento locais que já
tenham leads de teste com tags perdem esse dado ao rodar a migração — aceitável, documentado
em `CHANGELOG`/Assumptions da spec. Se um dia isso rodasse contra uma base com dado real, o
caminho seria um script de _backfill_ único rodado **antes** do `DROP COLUMN` (fora do
escopo desta spec, pela mesma razão que a spec 031 — migração formal v1→v2 — é quem trata
dado real).
