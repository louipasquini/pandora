import { PlataformaOrigem, PLATAFORMAS_ORIGEM } from '../../../core/core.module';
import { ESTRATEGIA_RESOLUCAO_OFERTA, estrategiaDe } from './estrategia-por-plataforma';

describe('ESTRATEGIA_RESOLUCAO_OFERTA', () => {
  it('cobre exatamente as 7 contas', () => {
    expect(Object.keys(ESTRATEGIA_RESOLUCAO_OFERTA).sort()).toEqual(
      [...PLATAFORMAS_ORIGEM].sort(),
    );
  });

  it.each([
    PlataformaOrigem.TMB,
    PlataformaOrigem.ASAAS_PRD,
    PlataformaOrigem.ASAAS_SVC,
    PlataformaOrigem.GURU_PRD,
    PlataformaOrigem.GURU_SVC,
  ])('%s -> TAG', (p) => {
    expect(ESTRATEGIA_RESOLUCAO_OFERTA[p]).toBe('TAG');
  });

  it.each([PlataformaOrigem.HOTMART_PRD, PlataformaOrigem.HOTMART_SVC])(
    '%s -> CATALOGO_HOTMART',
    (p) => {
      expect(ESTRATEGIA_RESOLUCAO_OFERTA[p]).toBe('CATALOGO_HOTMART');
    },
  );
});

describe('estrategiaDe', () => {
  it('resolve a partir de string solta', () => {
    expect(estrategiaDe('HOTMART_SVC')).toBe('CATALOGO_HOTMART');
    expect(estrategiaDe('GURU_PRD')).toBe('TAG');
  });

  it('valor desconhecido -> TAG (permissivo)', () => {
    expect(estrategiaDe('LIXO')).toBe('TAG');
  });
});
