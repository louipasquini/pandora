# Contract — Porta in-process `RegistrarEventoService`

Exportada pelo `IngestaoModule`. É o **ponto único de escrita da etapa 0** e o que os
adapters das specs 019–022 vão injetar (sem passar por HTTP). O endpoint
`POST /ingestao/eventos` é um invólucro fino desta porta.

```ts
type EntradaIngestao = {
  plataformaOrigem: PlataformaOrigem;   // enum 7 do core
  tipoOrigem: string;                   // não vazio
  idOrigem: string;                     // não vazio
  payloadBruto: unknown;                // JSON-serializável
  eventoCanonico?: EventoCanonico;      // opcional (ver evento-canonico.md)
};

type ResultadoIngestao = {
  eventoId: EntidadeId;
  criado: boolean;                      // false = reentrega dedup
};

interface RegistrarEventoService {
  registrarEvento(entrada: EntradaIngestao): Promise<ResultadoIngestao>;
}
```

**Semântica**
1. Valida `entrada` (zod). Inválida → lança `BadRequestException` (o controller mapeia
   422); nada é persistido.
2. `hash = hashEvento(payloadBruto)` (canonicaliza + SHA-256 — `domain/hash-evento.ts`).
3. **Upsert idempotente** pela chave `(plataformaOrigem, idOrigem, hash)`:
   - inexistente → cria `EventoOrigem` (`status = pendente`, `recebidoEm = ultimoRecebidoEm
     = agoraUtc()`, `reentregas = 0`, `eventoCanonico` se veio) **e** 7 linhas
     `EventoEtapa`: `REGISTRAR = ok`, as outras `pendente`. Retorna `{ criado: true }`.
   - existente → `reentregas += 1`, `ultimoRecebidoEm = agoraUtc()`; **não** altera
     `payloadBruto`/`hash`/`status`/etapas. Retorna `{ criado: false }` com o id existente.
4. Commit próprio (uma transação Prisma). Não dispara o pipeline — o worker pega na próxima
   passada (ou o chamador pode invocar `WorkerService.processarPassada()`).

**Idempotência / concorrência**: a chave `@@unique` + captura de erro de violação de
unicidade (`P2002`) garantem que N chamadas concorrentes com a mesma chave resultem em 1
linha; as demais resolvem para ela (`criado: false`).

**Não faz**: classificação (é a etapa 1, no worker), resolução de pessoa/oferta/contrato,
qualquer escrita fora de `evento_origem`/`evento_etapa`.
