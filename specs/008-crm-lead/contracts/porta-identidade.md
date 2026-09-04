# Contract — `PortaIdentidade` no `core` (inversão de dependência — CL-02)

## No `core` (`src/core/identidade/porta-identidade.ts`) — só o contrato

```ts
export interface DadosIdentidadeLead {
  nome?: string;
  email?: string | null;
  telefone?: string | null;
  documento?: { tipo: 'CPF' | 'CNPJ'; valor: string } | string | null;
}

export interface OrigemIdentidade {
  plataformaOrigem: string;                      // ex.: 'crm_lead'
  refs: { tipoRef: string; valorRef: string }[]; // ex.: [{ tipoRef: 'lead_id', valorRef: <id> }]
}

export interface OpcoesPortaIdentidade {
  criar: boolean;            // false = nunca cria pessoa (afiliada); na conversão é sempre true
  origem: OrigemIdentidade;
}

export interface ResultadoPortaIdentidade {
  pessoaId: string;
  criada: boolean;
}

export interface PortaIdentidade {
  resolverOuCriar(
    dados: DadosIdentidadeLead,
    opts: OpcoesPortaIdentidade,
  ): Promise<ResultadoPortaIdentidade>;
}

export const PORTA_IDENTIDADE = Symbol('PORTA_IDENTIDADE');
```

Re-exportado no barrel `src/core/core.module.ts` (`// --- identidade (008) ---`).
**Zero import de `clientes`. Zero lógica.** É contrato puro.

## Na spec 005 (`src/clientes/infra/porta-identidade.adapter.ts`) — a implementação

```ts
@Injectable()
export class PortaIdentidadeAdapter implements PortaIdentidade {
  constructor(private readonly resolver: ResolverOuCriarService) {}

  async resolverOuCriar(dados, opts): Promise<ResultadoPortaIdentidade> {
    const r = await this.resolver.resolverOuCriar(
      mapearDados(dados),                       // DadosIdentidadeLead -> DadosIdentidade (005)
      { criar: opts.criar, origem: opts.origem },
    );
    return { pessoaId: r.pessoaId!, criada: r.criada };
  }
}
```

### Wiring — módulo `@Global()` dentro de `clientes`

`src/clientes/identidade-wiring.module.ts`:
```ts
@Global()
@Module({
  imports: [ClientesModule],
  providers: [
    PortaIdentidadeAdapter,
    { provide: PORTA_IDENTIDADE, useExisting: PortaIdentidadeAdapter },
  ],
  exports: [PORTA_IDENTIDADE],
})
export class IdentidadeWiringModule {}
```
`AppModule` importa `IdentidadeWiringModule`. Como é `@Global()`, o token
`PORTA_IDENTIDADE` fica injetável em **qualquer** módulo (inclusive `CrmModule`) **sem**
import — nenhum arquivo de `src/crm/**` referencia `src/clientes/**`. O módulo de wiring
vive **dentro** de `src/clientes/`, então importar `ClientesModule` ali é intra-contexto
(permitido). `ResolverOuCriarService` **não muda**. `mapearDados` converte `documento`
string → `{ tipo, valor }` reusando o detector de CPF/CNPJ que a 005 já tem no seu
`domain`.

> Este é o padrão que a **spec 018** (pipeline `financeiro`, etapa "resolver pessoa")
> também vai usar para consumir `ResolverOuCriarService` sem violar o Princípio VI.

## No `crm` — o consumo

```ts
@Injectable()
export class LeadConversaoService {
  constructor(
    @Inject(PORTA_IDENTIDADE) private readonly identidade: PortaIdentidade,
    private readonly prisma: PrismaService,
    private readonly audit: CrmLeadAuditService,
  ) {}
}
```

`CrmModule` **não** importa `ClientesModule` nem `IdentidadeWiringModule` — o token vem do
módulo `@Global()`. Os únicos `import`s de `src/crm/**` relacionados são de
`src/core/identidade/porta-identidade` (interface `PortaIdentidade` + `PORTA_IDENTIDADE`) —
`core` é permitido. **Nada** em `src/crm/**` importa de `src/clientes/**`.

## Teste

- unit: `PortaIdentidadeAdapter` mapeia `documento` string→objeto e repassa `origem`.
- e2e: conversão real cria/resolve `pessoa`; `grep -R "from '.*clientes" backend/src/crm =
  0`; ESLint verde.
