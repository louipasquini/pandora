# Research — 008 crm-lead (Phase 0)

Todas as decisões abaixo alimentam `data-model.md`, `contracts/` e `plan.md`. Nenhum
`NEEDS CLARIFICATION` permanece — CL-01/CL-02/CL-03 foram resolvidos com o dono do produto
em 2026-09-04 (spec §Clarifications).

---

## 1. Como o `crm` consome a engine de identidade da 005 (CL-02)

**Decisão**: **inversão de dependência via `core`**. O `core` declara a interface
`PortaIdentidade` (o subconjunto de `resolverOuCriar` que a conversão precisa) e um token
DI `PORTA_IDENTIDADE`. A spec 005 (`clientes`) registra um adaptador `@Injectable()` que a
implementa delegando ao `ResolverOuCriarService` já existente, e o `ClientesModule` passa a
**prover e exportar** `{ provide: PORTA_IDENTIDADE, useExisting: PortaIdentidadeAdapter }`.
O `crm` injeta `@Inject(PORTA_IDENTIDADE) porta: PortaIdentidade` — **nunca** o serviço
concreto, nunca um import de `src/clientes/**`.

**Rationale**:
- O Princípio VI (constituição) e a regra ESLint `import/no-restricted-paths` proíbem
  `crm` → `clientes`. Mas a regra inviolável da 005 é que a dedup é **um serviço único e
  auditável** — reimplementar no `crm` seria a "gambiarra" que a reconstrução existe para
  evitar.
- O `core` é `@Global()` e já é a exceção declarada à fronteira entre contextos. Publicar um
  **contrato** (interface + token) lá é exatamente o que "contratos explícitos" (Princípio
  III/VI) pede. Zero lógica no `core`.
- Mantém a conversão **síncrona e transacional**: o `crm` abre a transação, chama a porta,
  grava `pessoa_id` no `lead`, tudo num `$transaction`.

**Alternativas rejeitadas**:
- **`crm` importa `clientes`** — viola Princípio VI + ESLint. Não.
- **Orquestração na borda (`admin`/`api`)** — tira a lógica de conversão do dono (`crm`),
  espalha a transação por dois módulos, e o endpoint `POST /crm/leads/:id/converter` teria
  de virar `POST /admin/...`. Pior coesão.
- **Evento assíncrono (`lead` emite, `clientes` reage)** — a conversão deixa de ser
  síncrona; o painel precisa exibir estado "convertendo"; a 005 teria de ganhar um consumidor
  de evento que hoje não existe; a idempotência fica mais difícil de garantir. Mais peças
  para menos benefício.

**Forma do contrato** (ver `contracts/porta-identidade.md`):
```
export interface DadosIdentidadeLead {
  nome?: string; email?: string; telefone?: string;
  documento?: { tipo: 'CPF' | 'CNPJ'; valor: string } | string | null;
}
export interface ResultadoPortaIdentidade { pessoaId: string; criada: boolean; }
export interface PortaIdentidade {
  resolverOuCriar(dados: DadosIdentidadeLead, opts: {
    criar: boolean;
    origem: { plataformaOrigem: string; refs: { tipoRef: string; valorRef: string }[] };
  }): Promise<ResultadoPortaIdentidade>;
}
export const PORTA_IDENTIDADE = Symbol('PORTA_IDENTIDADE');
```
O adaptador da 005 mapeia `DadosIdentidadeLead` para o `DadosIdentidade` interno e devolve
`{ pessoaId, criada }` a partir do `ResultadoResolverOuCriar`. `opts.origem` da conversão =
`{ plataformaOrigem: 'crm_lead', refs: [{ tipoRef: 'lead_id', valorRef: <id> }] }` — assim a
`pessoa` ganha um `pessoa_origem_ref` rastreável de volta ao lead.

**Wiring NestJS**: a regra ESLint `import/no-restricted-paths` barra **qualquer** `import`
de `src/crm/**` que resolva para `src/clientes/**` — inclusive `crm.module.ts` importando
`ClientesModule`. Solução: um módulo **`@Global()`** `src/clientes/identidade-wiring.module.ts`
(dentro do próprio contexto `clientes`, então pode importar `ClientesModule`) que provê e
**exporta** `PORTA_IDENTIDADE`. `AppModule` o importa; por ser `@Global()`, o token fica
injetável em `CrmModule` **sem** nenhum import. Confirmado que `@Global()` propaga o token a
módulos que não importam o módulo de origem. Este é o padrão que a **spec 018** herda.

---

## 2. Normalização de contato no `crm/domain`

**Decisão**: **duplicar uma normalização mínima** de contato em `src/crm/domain/lead/
normalizar-lead.ts` (e-mail `lowercase`+`trim`; telefone E.164 com `+55` na borda;
documento só dígitos + DV de CPF/CNPJ) — **não** promover as funções da 005 ao `core` nesta
spec.

**Rationale**:
- O `core` hoje **não** expõe `normalizar`/DV de documento — eles vivem em
  `src/clientes/domain`. Promover ao `core` é uma mudança transversal que mexe na 005 e
  merece a própria discussão; fora do escopo desta spec.
- A normalização que o `lead` precisa é pequena e sem heurística de provedor (mesma
  disciplina da 005). Duplicar ~40 linhas puras e testadas é mais barato e menos arriscado
  que um refactor cross-context agora.
- A **fonte de verdade da dedup continua sendo a 005**: a conversão manda os dados crus/
  normalizados para a `PortaIdentidade`, que re-normaliza com as funções da 005 antes de
  resolver. A normalização no `crm` serve só para (a) validar entrada cedo (422) e (b)
  guardar o `lead` consistente.

**Registro para o futuro**: quando a 009/010 também precisarem, considerar promover
`normalizar` + DV ao `core` numa spec de refactor (`[[053-auditoria-e-observabilidade-global]]`
ou uma dedicada). Marcado em `docs/008-crm-lead.md`.

**Alternativa rejeitada**: `crm` importa `src/clientes/domain/normalizar` — a regra ESLint
barra `src/clientes/**` inteiro, não só `application/`. Não.

---

## 3. Lead scoring — forma da função e tabela de pesos

**Decisão**: `calcularScore(estado: EstadoScoreLead) → number` puro, determinístico, com
**tabela de pesos congelada** `PESOS_SCORE_LEAD` (const no módulo, versionada por PR).
Score final = soma dos componentes, **clampeado a `[0, 100]`**, inteiro.

**`EstadoScoreLead`** (materializado por quem chama — o serviço lê do banco):
```
{
  temEmail: boolean; temTelefone: boolean; temDocumento: boolean;
  temUtm: boolean;                 // qualquer utm_* preenchido
  origem: string | null;
  estagio: LeadEstagio;
  criadoEm: string;                // ISO — vira "idade em dias" via agoraUtc()
  qtdInteracoes: number;           // reservado p/ 009; 0 nesta spec (nenhuma interacao ainda)
  ultimaInteracaoEm: string | null;
  qtdTags: number;
}
```

**Componentes** (pesos iniciais — ajustáveis por PR, documentados em `contracts/scoring.md`):
| Componente | Regra | Pontos |
|---|---|---|
| Completude de contato | +12 e-mail, +8 telefone, +5 documento | 0–25 |
| Origem rastreável | +10 se `temUtm`, senão +4 se `origem != null` | 0–10 |
| Estágio no funil | `NOVO` 0 · `CONTATO_FEITO` 10 · `QUALIFICADO` 25 · `NUTRICAO` 15 · `DESQUALIFICADO` −20 | −20–25 |
| Engajamento | `min(qtdInteracoes, 5) * 4` + `qtdTags >= 1 ? 5 : 0` | 0–25 |
| Recência | interação/criação ≤ 3d: +15 · ≤ 14d: +8 · ≤ 30d: +3 · senão 0 | 0–15 |
| Decaimento por idade sem engajamento | idade > 30d **e** `qtdInteracoes == 0`: −10 | −10–0 |

Soma bruta ∈ `[−50, 100]` → `clamp(round(soma), 0, 100)`. Lead recém-criado com só e-mail:
`12 + 4 + 0 + 0 + 15 + 0 = 31` (base determinística > 0, como exige o Edge Case).

**Rationale**: regra 8.2.2 da visão — métrica **derivada**, nunca contador incremental.
Congelar os pesos no código (não em tabela de banco) nesta v1 evita um subdomínio de
configuração que a spec explicitamente adia. `agoraUtc()`/`parseInstante` do core garantem
determinismo livre de locale (a "idade" é `floor((agoraUtc − criadoEm) / 1d)` em UTC).

**Alternativas rejeitadas**:
- Pesos configuráveis em runtime (tabela + UI) — spec de CRM posterior (spec §Out of Scope).
- Score como `float` — proibido pela disciplina do projeto; inteiro `[0,100]` é o que o
  painel mostra.
- ML / modelo estatístico — fora de escopo e não determinístico.

---

## 4. Checagem de `pessoa:editar` na conversão

**Decisão**: `POST /crm/leads/:id/converter` usa **`@RequerPermissao('lead:editar',
'pessoa:editar')`**. O `PermissionGuard` da 004 (confirmado no código:
`requer-permissao.decorator.ts` + `permission.guard.ts`) tem semântica **E** por _varargs_ —
`faltando = exigidas.filter(p => !efetivas.has(p))`; qualquer uma faltando → 403 genérico
**antes** do handler. Zero checagem extra no serviço.

**Rationale**: a conjunção é exatamente o que o guard já faz. `pessoa:editar` é permissão da
005, já no catálogo; `administrador`/credencial de serviço a têm de graça. O 403 sai com o
corpo genérico da 004 e o lead permanece `ATIVO` (nenhuma escrita ocorreu).

---

## 5. Escopo de visão `lead:ver_proprios` — implementação

**Decisão**: `lead-consulta.service` recebe o `Request` (rota é `@AutenticadoBasta()`),
resolve `permissoesDe(req)` e o `sujeito` (`req.auth`) e monta o `where` do Prisma:
- nenhuma de `lead:ver_todos`/`lead:ver_proprios` → `ForbiddenException` (403);
- tem `lead:ver_todos` (inclui `administrador` e credencial de serviço, que têm o catálogo
  inteiro) → sem filtro de responsável;
- senão (só `lead:ver_proprios`) → `where.responsavelId = sujeito.usuarioId` **e**
  `responsavelId` não-nulo (fila não atribuída invisível — spec FR-012). Credencial de
  serviço nunca cai aqui (já tem `ver_todos`).

Filtros do query-string (`responsavelId`, `estagio`, `status`, `origem`, `campo:*`) são
aplicados **por cima** do `where` de escopo com `AND` — nunca substituem. `obter(id)` roda o
mesmo `where` + `id`; miss → 404 (não 403 — não vaza existência).

**"OU" na rota**: o `@RequerPermissao` é **E** (varargs). Para "`lead:ver_todos` OU
`lead:ver_proprios`" as rotas de **leitura** de lead usam **`@AutenticadoBasta()`** (só
exige JWT) e o **`lead-consulta.service` faz o gate OU + o escopo numa passada só**: chama
`SujeitoRbacService.permissoesDe(req)`, e se o `Set` não contém **nenhuma** das duas →
`ForbiddenException` (403 genérico). Como o serviço **já precisa** do sujeito para montar o
`where` de escopo, não há guard/consulta extra. Documentado em `contracts/leads-crud.md`.
(Alternativa — um `CanActivate` `LeadLeituraGuard` dedicado — foi considerada e rejeitada:
duplicaria a resolução de permissões que o serviço faz de qualquer jeito.)

**Rationale**: aplicar no `where` (não na serialização) é o que impede vazamento por
paginação/contagem/`campo:*` (SC-003). Credencial de serviço cai em `ver_todos` porque tem
o catálogo inteiro (special-case da 004) — `ver_proprios` sozinho nunca se aplica a ela
(spec FR-013).

---

## 6. Campos personalizados — 2 tabelas + validação por tipo (CL-03)

**Decisão**: duas tabelas.
- **`campo_personalizado_lead`** (definição): `id` UUID v7, `chave` (slug único, `^[a-z][a-z0-9_]{1,39}$`, **imutável**), `rotulo`, `tipo` (`TEXTO|NUMERO|BOOLEANO|DATA|SELECAO`), `opcoes` `String[]` (não-vazio **sse** `SELECAO`, senão vazio), `obrigatorio` `Boolean`, `ativo` `Boolean` default `true`, timestamps.
- **`valor_campo_lead`**: `id` UUID v7, `leadId` (FK `lead`, `onDelete: Cascade`), `definicaoId` (FK `campo_personalizado_lead`, `onDelete: Restrict`), `valor` `String` (serialização canônica por tipo — ver abaixo), timestamps, `@@unique([leadId, definicaoId])`.

**Serialização de `valor`** (texto, validado na escrita):
- `TEXTO` → a string (trim; vazio → remove a chave);
- `NUMERO` → decimal canônico (`Number.isFinite`; guardado como string p/ não perder
  precisão);
- `BOOLEANO` → `"true"`/`"false"`;
- `DATA` → `YYYY-MM-DD` (valida com `parseInstante`? não — data-calendário; regex + `Date`);
- `SELECAO` → deve estar em `opcoes` da definição.

**`PUT /crm/leads/:id/campos-personalizados`** = **substituição total**: corpo
`{ [chave]: valor | null }`. Passos: (1) carrega definições ativas; (2) chave desconhecida
ou definição inativa → 422; (3) valida cada valor pelo tipo → 422; (4) toda definição
`obrigatorio` **ativa** ausente do corpo (ou `null`) → 422; (5) diff contra o estado atual
→ upsert/delete; (6) 1 registro em `crm_lead_audit` com delta por chave (no-op → 0).

**Definições** são CRUD sob `crm_admin:gerir_campos_lead` em `/crm/admin/campos-lead` (fica
junto da administração do CRM da 007). `DELETE` de definição **com valores** → 409 (mensagem
sugere `PATCH { ativo:false }`); `DELETE` de definição sem uso → físico. Mudança de
definição → auditada em **`crm_admin_audit`** (tabela da 007).

**Rationale**: o dono do produto escolheu esquema administrável (robustez, validação de
tipo, rótulos pt-BR no painel). Duas tabelas é o mínimo. `valor` como texto único (não
colunas por tipo) mantém a tabela simples; a validação forte acontece na escrita.

**Alternativa rejeitada**: `jsonb` livre por lead — foi a opção B do CL-03, descartada pelo
dono do produto.

---

## 7. Frontend — nav/rota com "anyOf" de permissão

**Decisão**: estender o suporte de `requerPermissao` em `nav-items.ts` e `RequirePermissao`
para aceitar **`string | string[]`** com semântica **OU** (`anyOf`). Hoje a 004/007 usam
`requerPermissao: 'x'` (single). Para o Lead, `['lead:ver_todos', 'lead:ver_proprios']` = o
item aparece se o sujeito tiver **qualquer** das duas. `usePermissoesEfetivas` já devolve o
`Set`; a checagem vira `perms.some(p => efetivas.has(p))`.

**Rationale**: mínimo toque, retrocompatível (string continua funcionando). Sem isso, o item
**CRM · Leads** teria de repetir lógica ou exigir só `ver_todos` (errado — quem só vê os
próprios também precisa do item).

**Alternativa rejeitada**: dois itens de nav (um por permissão) — polui a navegação e
duplica a rota.

---

## 8. `RegistrarLeadService` — porta in-process para a 035

**Decisão**: `@Injectable()` exportado do `CrmModule`. `registrar(entrada:
CriarLeadEntrada, chaveOrigem: { origem: string; idExterno: string }) → { leadId: string;
criado: boolean }`. Idempotência por **`@@unique([origem, id_externo])`** parcial em `lead`
(colunas `origem`/`id_externo` — `id_externo` nullable; único só quando ambos presentes,
via índice parcial no `migration.sql`, como a 005/007 fazem). Reentrada → devolve o lead
existente, `criado: false`. Auditoria: `AJUSTE_MANUAL`, autor = `chaveOrigem.origem`
(ex.: `"marketing:meta_ads"`).

**Rationale**: a spec 035 (coleta de leads de Marketing) precisa de um ponto de entrada
idempotente que **não** seja HTTP (ela projeta `evento_origem` e chama in-process, como a
018 fará com `ResolverOuCriarService`). Modelar agora a porta + a chave evita retrabalho de
migração depois. **Nenhum** endpoint `/webhooks/*` nesta spec.

**Nota**: `id_externo` fica **fora da PK** (Princípio I) — é coluna comum com índice único
parcial, exatamente como `evento_origem` da 006 trata `id_origem`.

---

## 9. Máquina de estados `status` / `estagio`

- `status`: `ATIVO` → `DESCARTADO` (manual) · `ATIVO` → `CONVERTIDO` (só via `converter`) ·
  `DESCARTADO` → `ATIVO` (reativar, manual) · `CONVERTIDO` é **terminal** (nunca volta;
  `converter` de novo é no-op).
- `estagio`: livre entre os 5 valores (`NOVO|CONTATO_FEITO|QUALIFICADO|NUTRICAO|
  DESQUALIFICADO`) por `PATCH` — é o funil pré-pipeline, sem restrição de ordem. Não bloqueia
  conversão (só `status` bloqueia).
- `converter` exige `status = ATIVO`; `DESCARTADO` → 409; `CONVERTIDO` → 200 no-op.

Documentado em `data-model.md` §Máquina de estados.

---

## 10. Índices e performance

`lead`: índices em `(status, estagio)`, `(responsavel_id)`, `(origem)`, `(email)`,
`(telefone)`, `(pessoa_id)`, e o único parcial `(origem, id_externo) WHERE id_externo IS NOT
NULL`. Listagem paginada (default 25, teto 100), ordenada por `(score DESC, criado_em DESC)`
por padrão. `recalcular-score` em lote: cursor por `id`, páginas de 200, cada página em
`$transaction`. Nenhuma meta de throughput (volume de leads da AEN é de milhares, não
milhões).
