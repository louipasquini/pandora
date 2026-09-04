import { PortaIdentidadeAdapter } from './porta-identidade.adapter';
import type { ResolverOuCriarService } from '../application/resolver-ou-criar.service';

describe('PortaIdentidadeAdapter', () => {
  it('repassa dados + origem para o ResolverOuCriarService e mapeia o resultado', async () => {
    const resolver = {
      resolverOuCriar: jest.fn().mockResolvedValue({
        pessoaId: 'p1',
        criada: true,
        candidatos: [],
        notas: 0,
      }),
    } as unknown as ResolverOuCriarService;

    const adapter = new PortaIdentidadeAdapter(resolver);
    const origem = {
      plataformaOrigem: 'crm_lead',
      refs: [{ tipoRef: 'lead_id', valorRef: 'L1' }],
    };

    const r = await adapter.resolverOuCriar(
      { nome: 'Ana', documento: '390.533.447-05', email: 'ana@ex.com', telefone: null },
      { criar: true, origem },
    );

    expect(r).toEqual({ pessoaId: 'p1', criada: true });
    expect(resolver.resolverOuCriar).toHaveBeenCalledWith(
      { nome: 'Ana', documento: '390.533.447-05', email: 'ana@ex.com', telefone: null },
      { criar: true, origem },
    );
  });

  it('propaga criar:false (afiliada) e pessoaId null', async () => {
    const resolver = {
      resolverOuCriar: jest.fn().mockResolvedValue({
        pessoaId: null,
        criada: false,
        candidatos: [],
        notas: 0,
      }),
    } as unknown as ResolverOuCriarService;

    const r = await new PortaIdentidadeAdapter(resolver).resolverOuCriar(
      { email: 'x@y.com' },
      { criar: false, origem: { plataformaOrigem: 'crm_lead', refs: [] } },
    );
    expect(r).toEqual({ pessoaId: null, criada: false });
  });
});
