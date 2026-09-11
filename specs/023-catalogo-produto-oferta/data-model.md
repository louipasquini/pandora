# Data Model: Catálogo — `produto` → `oferta`

Todas as entidades: id surrogate UUID v7 gerado na app (`EntidadeId.novo().value`), timestamps
`criadoEm`/`atualizadoEm` (`@db.Timestamptz(6)`, UTC), sem exceção.

## `Produto`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid PK | |
| `codigo` | string(3) | `@@unique`; maiúsculo, imutável após criação |
| `nomeCurado` | string? | curadoria manual — vence se não-nulo |
| `nomeDerivado` | string? | reservado (hoje nunca preenchido automaticamente — nenhum adapter expõe nome de produto estruturado; existe pra simetria com `oferta` e para uma fonte futura) |
| `assinaturaCurada` | boolean? | curadoria manual |
| `assinaturaDerivada` | boolean? | idem `nomeDerivado` |
| `camposEditados` | string[] | trava contra sobrescrita (D-07) |

Valor efetivo de leitura: `nome = nomeCurado ?? nomeDerivado ?? null`, idem `assinatura`.

## `Oferta`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid PK | |
| `produtoId` | uuid FK → `Produto` | `onDelete: Restrict` |
| `turmaTipoCurado` | enum `TurmaTipo`? | `NUMERO\|EVERGREEN\|PERPETUO\|DESCONHECIDO` |
| `turmaNumeroCurado` | int? | só quando `turmaTipoCurado = NUMERO` |
| `turmaTipoDerivado` | enum `TurmaTipo`? | do decodificador de tag |
| `turmaNumeroDerivado` | int? | idem |
| `subprodutoCodigoCurado` / `Derivado` | char(1)? | cru, sem tradução (D-01) |
| `modeloCobrancaCodigoCurado` / `Derivado` | char(1)? | cru |
| `modeloTransacaoCodigoCurado` / `Derivado` | char(1)? | cru |
| `camposEditados` | string[] | |

Valor efetivo de leitura (por campo): curado se não-nulo, senão derivado, senão `null` — nunca
mistura tipo+número de fontes diferentes (se `turmaTipoCurado` é não-nulo, `turmaNumeroCurado`
é a fonte de número também, mesmo que seja `null` por não se aplicar ao tipo `EVERGREEN`).

## `OfertaOrigemRef`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid PK | |
| `ofertaId` | uuid FK → `Oferta` | `onDelete: Cascade` |
| `plataformaOrigem` | enum `PlataformaOrigem` (core) | |
| `tipoRef` | enum `OfertaOrigemRefTipo` | `TAG \| HOTMART_PRICE_CODE` |
| `valorRef` | string | cru — a tag de 8 chars, ou o `price_code` da Hotmart |

`@@unique(plataformaOrigem, tipoRef, valorRef)` — chave de resolução; nunca PK de `Oferta`
(Princípio I).

## `OfertaCatalogo`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid PK | |
| `ofertaId` | uuid FK → `Oferta` `@unique` | 1:1, exclusivo por oferta (CL-01/R7) |
| `ticketInt` / `ticketMoeda` | bigint? / char(3)? | `Dinheiro` (par) |
| `precoTabelaInt` / `precoTabelaMoeda` | bigint? / char(3)? | `Dinheiro` (par) |
| `tempoAcessoDias` | int? | dias inteiros (Assumptions) |
| `combo` | boolean | default `false` |
| `lancamento` | boolean | default `false` |

100% curado — sem coluna "derivada" (D-08).

## `OfertaCatalogoBonus`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid PK | |
| `ofertaCatalogoId` | uuid FK → `OfertaCatalogo` | `onDelete: Cascade` |
| `descricao` | string | |
| `ordem` | int | preserva ordem de exibição |

## `OfertaCatalogoComboItem`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid PK | |
| `ofertaCatalogoId` | uuid FK → `OfertaCatalogo` | `onDelete: Cascade` |
| `produtoId` | uuid FK → `Produto` | produto incluso no combo |

`@@unique(ofertaCatalogoId, produtoId)`.

## `JanelaLancamento`

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | uuid PK | |
| `produtoId` | uuid FK → `Produto` | |
| `rotulo` | string | ex. "Turma 50" |
| `inicio` | date (`@db.Date`) | |
| `fim` | date (`@db.Date`) | |

Só populada via import de `lancamentos.csv` (D-10) — sem endpoint de escrita dedicado.

## `CatalogoAudit`

Forma canônica do core (idêntica a `ClientesAudit`/`CrmAdminAudit`): `id`, `autor`, `quando`,
`entidade`, `entidadeId`, `campo`, `valorAnterior` (Json?), `valorNovo` (Json?), `motivo`,
`origem`, `criadoEm`. `@@index([entidade, entidadeId])`, `@@map("catalogo_audit")`.

## Alteração em `Transacao` (já existente, spec 018)

`ofertaId` já é coluna nullable sem `@relation`. Esta spec adiciona a relação Prisma:

```prisma
oferta Oferta? @relation(fields: [ofertaId], references: [id], onDelete: SetNull)
```

Migração via `ALTER TABLE transacao ADD CONSTRAINT ... FOREIGN KEY (oferta_id) REFERENCES
oferta(id) ON DELETE SET NULL` — não-destrutivo (coluna e dados existentes preservados), mesmo
padrão usado pela 018 para `pessoaId`.

## Enums novos (Prisma)

- `TurmaTipo`: `NUMERO | EVERGREEN | PERPETUO | DESCONHECIDO`.
- `OfertaOrigemRefTipo`: `TAG | HOTMART_PRICE_CODE`.

## Schemas de coluna dos CSVs (D-12, R8)

**`produtos.csv`** (colunas esperadas, com aliases entre parênteses):
`codigo` (`código`, `code`), `nome` (`nome_produto`), `assinatura` (`é_assinatura`,
`is_subscription` — `"sim"/"não"`/`"true"/"false"`/`1`/`0`).

**`ofertas.csv`**:
`price_code` (`código_preço`, `price.code` — **obrigatória por linha**, D-12/FR-015),
`produto_codigo` (`produto`, `codigo_produto`), `tag` (`tag_aen`, opcional — quando presente,
grava também `oferta_origem_ref(plataforma, 'TAG', tag)` além da entrada por
`HOTMART_PRICE_CODE`), `nome` (opcional, informativo).

**`lancamentos.csv`**:
`produto_codigo` (`produto`), `rotulo` (`turma`, `label`), `inicio` (`data_inicio`,
`início`), `fim` (`data_fim`, `término`) — datas em `YYYY-MM-DD`.

Todos os 3 parsers seguem o padrão já estabelecido pelas specs 019–022: detecção de separador
`,`/`;` pelo cabeçalho, remoção de BOM, mini state-machine de aspas, 0 dependência nova.
