import { EtapaIngestao, EventoEtapaStatus, EventoOrigemStatus } from '@prisma/client';
import { planejarPassada } from './plano-passada';
import type { EtapaSnapshot } from './tipos';

const S = EventoEtapaStatus;

/** Monta o snapshot das 7 etapas com overrides por nome. */
function snap(over: Partial<Record<EtapaIngestao, Partial<EtapaSnapshot>>>): EtapaSnapshot[] {
  return (
    [
      EtapaIngestao.REGISTRAR,
      EtapaIngestao.CLASSIFICAR,
      EtapaIngestao.RESOLVER_PESSOA,
      EtapaIngestao.UPSERT_TRANSACAO,
      EtapaIngestao.RESOLVER_VINCULO,
      EtapaIngestao.RESOLVER_OFERTA,
      EtapaIngestao.PROJETAR_CONTRATO,
    ] as const
  ).map((etapa) => ({
    etapa,
    status: etapa === EtapaIngestao.REGISTRAR ? S.ok : S.pendente,
    tentativas: 0,
    ...over[etapa],
  }));
}

describe('planejarPassada (spec 006)', () => {
  it('etapa ok/pulada → JA_OK, nunca reexecuta', () => {
    const { acoes } = planejarPassada(
      snap({
        CLASSIFICAR: { status: S.ok },
        RESOLVER_PESSOA: { status: S.pulada },
      }),
      3,
    );
    expect(acoes.get(EtapaIngestao.CLASSIFICAR)).toBe('JA_OK');
    expect(acoes.get(EtapaIngestao.RESOLVER_PESSOA)).toBe('JA_OK');
  });

  it('primeira etapa pendente com dependência ok → EXECUTAR; as de trás → BLOQUEADA', () => {
    const { acoes, statusEvento } = planejarPassada(snap({}), 3);
    expect(acoes.get(EtapaIngestao.CLASSIFICAR)).toBe('EXECUTAR');
    expect(acoes.get(EtapaIngestao.RESOLVER_PESSOA)).toBe('BLOQUEADA');
    expect(statusEvento).toBe(EventoOrigemStatus.pendente);
  });

  it('dependência em erro → dependente BLOQUEADA e evento erro', () => {
    const { acoes, statusEvento } = planejarPassada(
      snap({ CLASSIFICAR: { status: S.erro, tentativas: 1 } }),
      3,
    );
    expect(acoes.get(EtapaIngestao.CLASSIFICAR)).toBe('EXECUTAR'); // ainda re-tenta
    expect(acoes.get(EtapaIngestao.RESOLVER_PESSOA)).toBe('BLOQUEADA');
    expect(statusEvento).toBe(EventoOrigemStatus.erro);
  });

  it('erro com tentativas == max → ESGOTADA, não executa, evento erro', () => {
    const { acoes, statusEvento } = planejarPassada(
      snap({ CLASSIFICAR: { status: S.erro, tentativas: 3 } }),
      3,
    );
    expect(acoes.get(EtapaIngestao.CLASSIFICAR)).toBe('ESGOTADA');
    expect(statusEvento).toBe(EventoOrigemStatus.erro);
  });

  it('todas ok/pulada → evento ok', () => {
    const { statusEvento } = planejarPassada(
      snap({
        CLASSIFICAR: { status: S.ok },
        RESOLVER_PESSOA: { status: S.pulada },
        UPSERT_TRANSACAO: { status: S.pulada },
        RESOLVER_VINCULO: { status: S.pulada },
        RESOLVER_OFERTA: { status: S.pulada },
        PROJETAR_CONTRATO: { status: S.pulada },
      }),
      3,
    );
    expect(statusEvento).toBe(EventoOrigemStatus.ok);
  });

  it('alguma etapa marcada revisar, sem erro → evento revisar', () => {
    const { statusEvento } = planejarPassada(
      snap({
        CLASSIFICAR: { status: S.ok, revisar: true },
        RESOLVER_PESSOA: { status: S.pulada },
        UPSERT_TRANSACAO: { status: S.pulada },
        RESOLVER_VINCULO: { status: S.pulada },
        RESOLVER_OFERTA: { status: S.pulada },
        PROJETAR_CONTRATO: { status: S.pulada },
      }),
      3,
    );
    expect(statusEvento).toBe(EventoOrigemStatus.revisar);
  });

  it('é determinística', () => {
    const entrada = snap({ CLASSIFICAR: { status: S.erro, tentativas: 1 } });
    const primeiro = JSON.stringify([...planejarPassada(entrada, 3).acoes]);
    for (let i = 0; i < 20; i += 1) {
      expect(JSON.stringify([...planejarPassada(entrada, 3).acoes])).toBe(primeiro);
    }
  });
});
