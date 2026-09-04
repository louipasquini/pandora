# Contrato — Roteamento, SLA e Fila (domínio puro)

Estes três contratos não são endpoints — são as funções puras de
`backend/src/crm/domain/atendimento/` que os serviços de aplicação (e os testes unitários)
chamam diretamente. Documentados aqui porque são o núcleo de negócio desta spec (CL-01/
CL-02) e precisam de um contrato estável e testável independente de HTTP.

## `escolherAtendentePorCarga`

```ts
interface CandidatoRoteamento { usuarioId: string; cargaAtual: number }

function escolherAtendentePorCarga(
  candidatos: readonly CandidatoRoteamento[],
): string | null
```

- `candidatos` = membros ativos de toda `equipe` `tipo = ATENDIMENTO` e `ativo = true` que
  está em expediente agora (`estaEmExpediente`, 007), com `cargaAtual` = contagem **ao vivo**
  de `Atendimento WHERE atendenteAtualId = usuarioId AND status = EM_ATENDIMENTO` — montada
  pelo repositório, nunca lida de uma coluna.
- Devolve o `usuarioId` de menor `cargaAtual`; empate → menor `usuarioId` (ordem
  lexicográfica, desempate determinístico — D-R2).
- `candidatos` vazio → `null` (fica em `AGUARDANDO` sem atendente — FR-005).
- **Pura, sem I/O.** Chamada por `AbrirAtendimentoService` (criação) e
  `TransferenciaService` (transferência para equipe sem atendente específico).

## `calcularSlaAtendimento`

```ts
interface AtendimentoSlaEntrada {
  status: 'AGUARDANDO' | 'EM_ATENDIMENTO' | 'ENCERRADO'
  abertoEm: Date
  primeiraRespostaEm: Date | null
  slaMinutos: number
}
interface AtendimentoSlaResultado {
  estourado: boolean
  minutosDecorridos: number
  minutosRestantes: number | null // null quando já estourado, já respondido ou encerrado
}

function calcularSlaAtendimento(
  entrada: AtendimentoSlaEntrada,
  agora: Date,
): AtendimentoSlaResultado
```

- `primeiraRespostaEm != null` **ou** `status === 'ENCERRADO'` → nunca estourado
  (`estourado: false`, `minutosRestantes: null`) — o prazo só existe enquanto não houve
  resposta humana e o atendimento segue aberto.
- Caso contrário: `minutosDecorridos = floor((agora - abertoEm) / 60000)`;
  `estourado = minutosDecorridos > slaMinutos`; `minutosRestantes = estourado ? null :
  slaMinutos - minutosDecorridos`.
- **Pura**, diferença de instantes — sem dependência de fuso horário/`TZ` do processo
  (diferente de `estaEmExpediente`, que converte para hora local; aqui não há conversão).
- Chamada em toda leitura de fila/detalhe de atendimento (`AtendimentoConsultaService`) —
  nunca persistida (D-R3, Princípio V).

## `ordenarFila`

```ts
function ordenarFila<T extends { prioridade: 'NORMAL' | 'ALTA' | 'URGENTE'; abertoEm: Date }>(
  itens: readonly T[],
): T[]
```

- Ordena por `prioridade` decrescente (`URGENTE` > `ALTA` > `NORMAL`) e, dentro da mesma
  prioridade, por `abertoEm` crescente (FIFO) — D-06.
- **Pura**, não muta `itens` (devolve um novo array).

## `csatElegivel` / `interpretarRespostaCsat`

```ts
function csatElegivel(
  atendimento: { status: 'AGUARDANDO' | 'EM_ATENDIMENTO' | 'ENCERRADO'; csatSolicitadoEm: Date | null },
  jaTemResposta: boolean,
): boolean

function interpretarRespostaCsat(texto: string): number | null
```

- `csatElegivel`: `status === 'ENCERRADO' && csatSolicitadoEm != null && !jaTemResposta`.
- `interpretarRespostaCsat`: aceita um inteiro 0–10 isolado (com espaços/pontuação simples
  ao redor — ex.: `"9"`, `" 10 "`, `"nota: 8"` **não** casa, só o número puro ou cercado por
  pontuação trivial); qualquer outra coisa devolve `null`. Ambas puras, sem I/O.
