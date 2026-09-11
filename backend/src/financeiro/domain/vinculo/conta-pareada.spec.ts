import { PLATAFORMAS_ORIGEM, PlataformaOrigem } from '../../../core/core.module';
import { contaAsaasParDe, contaGuruParDe } from './conta-pareada';

describe('contaGuruParDe / contaAsaasParDe', () => {
  it('pareia PRD com PRD e SVC com SVC, nunca cruza', () => {
    expect(contaGuruParDe(PlataformaOrigem.ASAAS_PRD)).toBe(PlataformaOrigem.GURU_PRD);
    expect(contaGuruParDe(PlataformaOrigem.ASAAS_SVC)).toBe(PlataformaOrigem.GURU_SVC);
    expect(contaAsaasParDe(PlataformaOrigem.GURU_PRD)).toBe(PlataformaOrigem.ASAAS_PRD);
    expect(contaAsaasParDe(PlataformaOrigem.GURU_SVC)).toBe(PlataformaOrigem.ASAAS_SVC);
  });

  it('varredura das 7 contas — as 5 não-Asaas/Guru devolvem null', () => {
    const naoAsaas = PLATAFORMAS_ORIGEM.filter(
      (p) => p !== PlataformaOrigem.ASAAS_PRD && p !== PlataformaOrigem.ASAAS_SVC,
    );
    for (const p of naoAsaas) {
      expect(contaGuruParDe(p)).toBeNull();
    }
    const naoGuru = PLATAFORMAS_ORIGEM.filter(
      (p) => p !== PlataformaOrigem.GURU_PRD && p !== PlataformaOrigem.GURU_SVC,
    );
    for (const p of naoGuru) {
      expect(contaAsaasParDe(p)).toBeNull();
    }
  });

  it('lixo/plataforma inexistente → null', () => {
    expect(contaGuruParDe('LIXO')).toBeNull();
    expect(contaAsaasParDe('')).toBeNull();
  });
});
