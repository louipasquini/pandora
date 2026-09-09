import { acoesCompativeis, camposDoGatilho } from './catalogo-gatilho';

describe('camposDoGatilho', () => {
  it('gatilhos de lead expõem o catálogo de campos de lead', () => {
    for (const tipo of [
      'LEAD_CRIADO',
      'LEAD_ESTAGIO_MUDOU',
      'INTERACAO_REGISTRADA',
      'TAG_APLICADA',
    ] as const) {
      const campos = camposDoGatilho(tipo).map((c) => c.campo);
      expect(campos).toEqual(
        expect.arrayContaining(['estagio', 'status', 'origem', 'tags', 'score']),
      );
    }
  });

  it('OPORTUNIDADE_ETAPA_MUDOU expõe o catálogo de campos de oportunidade', () => {
    const campos = camposDoGatilho('OPORTUNIDADE_ETAPA_MUDOU').map((c) => c.campo);
    expect(campos).toEqual(expect.arrayContaining(['etapaTipo', 'pipelineId']));
    expect(campos).not.toContain('estagio');
  });

  it('EVENTO_EXTERNO não tem campos avaliáveis', () => {
    expect(camposDoGatilho('EVENTO_EXTERNO')).toEqual([]);
  });
});

describe('acoesCompativeis', () => {
  it('gatilhos de lead permitem só ações de lead', () => {
    const acoes = acoesCompativeis('LEAD_CRIADO');
    expect(acoes).toEqual(
      expect.arrayContaining(['MOVER_LEAD_ESTAGIO', 'APLICAR_TAG', 'REMOVER_TAG', 'REGISTRAR_NOTA']),
    );
    expect(acoes).not.toContain('MOVER_OPORTUNIDADE_ETAPA');
  });

  it('OPORTUNIDADE_ETAPA_MUDOU permite mover oportunidade e criar tarefa (spec 016)', () => {
    expect(acoesCompativeis('OPORTUNIDADE_ETAPA_MUDOU')).toEqual([
      'MOVER_OPORTUNIDADE_ETAPA',
      'CRIAR_TAREFA',
    ]);
  });

  it('gatilhos de lead também permitem criar tarefa (spec 016)', () => {
    expect(acoesCompativeis('LEAD_CRIADO')).toContain('CRIAR_TAREFA');
  });

  it('EVENTO_EXTERNO não restringe (nunca executa mesmo)', () => {
    expect(acoesCompativeis('EVENTO_EXTERNO')).toContain('MOVER_LEAD_ESTAGIO');
    expect(acoesCompativeis('EVENTO_EXTERNO')).toContain('MOVER_OPORTUNIDADE_ETAPA');
  });
});
