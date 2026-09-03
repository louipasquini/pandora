import { resolverIdentidade } from './resolver-identidade';
import type { PessoaCandidata } from './tipos';

const CPF_A = '52998224725';
const CPF_B = '11144477735';
const CNPJ = '11222333000181';

function cand(p: Partial<PessoaCandidata> & { id: string }): PessoaCandidata {
  return {
    documentos: [],
    cnpjs: [],
    emails: [],
    telefones: [],
    mergedPara: null,
    ...p,
  };
}

describe('resolverIdentidade (spec 005, US1)', () => {
  it('1 — resolve por documento (mesmo com e-mail/telefone divergentes)', () => {
    const cands = [
      cand({ id: 'p1', documentos: [CPF_A], emails: ['outro@x.com'] }),
      cand({ id: 'p2', emails: ['maria@x.com'], telefones: ['+5511999990000'] }),
    ];
    const r = resolverIdentidade(
      { documento: '529.982.247-25', email: 'maria@x.com', telefone: '11 99999-0000' },
      cands,
    );
    expect(r.pessoaId).toBe('p1');
    expect(r.criterio).toBe('documento');
    expect(r.confianca).toBe('ALTA');
  });

  it('2 — e-mail casa 2 pessoas → descarta o critério, tenta telefone', () => {
    const cands = [
      cand({ id: 'p1', emails: ['dup@x.com'] }),
      cand({ id: 'p2', emails: ['dup@x.com'] }),
      cand({ id: 'p3', telefones: ['+5511988880000'] }),
    ];
    const r = resolverIdentidade(
      { email: 'dup@x.com', telefone: '11 98888-0000' },
      cands,
    );
    expect(r.pessoaId).toBe('p3');
    expect(r.criterio).toBe('telefone');
    expect(r.confianca).toBe('BAIXA');
  });

  it('3 — prioridade estrita: documento vence telefone', () => {
    const cands = [
      cand({ id: 'pDoc', documentos: [CPF_A] }),
      cand({ id: 'pTel', telefones: ['+5511977770000'] }),
    ];
    const r = resolverIdentidade(
      { documento: '52998224725', telefone: '11 97777-0000' },
      cands,
    );
    expect(r.pessoaId).toBe('pDoc');
    expect(r.criterio).toBe('documento');
  });

  it('4 — nada casa → null + candidatos vazio', () => {
    const r = resolverIdentidade(
      { documento: CPF_B, email: 'ninguem@x.com' },
      [cand({ id: 'p1', emails: ['alguem@x.com'] })],
    );
    expect(r.pessoaId).toBeNull();
    expect(r.criterio).toBeNull();
    expect(r.confianca).toBeNull();
    expect(r.candidatos).toEqual([]);
  });

  it('5 — documento com DV inválido não vira critério; cai para e-mail', () => {
    const cands = [cand({ id: 'p1', emails: ['maria@x.com'] })];
    const r = resolverIdentidade(
      { documento: '111.111.111-11', email: 'maria@x.com' },
      cands,
    );
    expect(r.pessoaId).toBe('p1');
    expect(r.criterio).toBe('email');
  });

  it('6 — determinística: 50 execuções idênticas', () => {
    const cands = [
      cand({ id: 'p1', emails: ['dup@x.com'] }),
      cand({ id: 'p2', emails: ['dup@x.com'] }),
      cand({ id: 'p3', telefones: ['+5511988880000'], cnpjs: [CNPJ] }),
    ];
    const entrada = { cnpj: undefined, email: 'dup@x.com', telefone: '11988880000' };
    const primeiro = JSON.stringify(resolverIdentidade(entrada, cands));
    for (let i = 0; i < 50; i++) {
      expect(JSON.stringify(resolverIdentidade(entrada, cands))).toBe(primeiro);
    }
  });

  it('7 — chave casa pessoa mergedPara → resolve a raiz ativa', () => {
    const cands = [
      cand({ id: 'absorvida', emails: ['x@x.com'], mergedPara: 'raiz' }),
      cand({ id: 'raiz' }),
    ];
    const r = resolverIdentidade({ email: 'x@x.com' }, cands);
    expect(r.pessoaId).toBe('raiz');
    expect(r.criterio).toBe('email');
  });

  it('8 — e-mail e telefone ambos ambíguos → null + candidatos com criterios', () => {
    const cands = [
      cand({ id: 'p1', emails: ['dup@x.com'], telefones: ['+5511911110000'] }),
      cand({ id: 'p2', emails: ['dup@x.com'] }),
      cand({ id: 'p3', telefones: ['+5511911110000'] }),
    ];
    const r = resolverIdentidade(
      { email: 'dup@x.com', telefone: '11 91111-0000' },
      cands,
    );
    expect(r.pessoaId).toBeNull();
    const ids = r.candidatos.map((c) => c.id).sort();
    expect(ids).toEqual(['p1', 'p2', 'p3']);
    const p1 = r.candidatos.find((c) => c.id === 'p1')!;
    expect(p1.criterios.sort()).toEqual(['email', 'telefone']);
  });

  it('CNPJ resolve pelo critério cnpj (confiança ALTA)', () => {
    const r = resolverIdentidade({ documento: '11.222.333/0001-81' }, [
      cand({ id: 'pj', cnpjs: [CNPJ] }),
    ]);
    expect(r.pessoaId).toBe('pj');
    expect(r.criterio).toBe('cnpj');
    expect(r.confianca).toBe('ALTA');
  });
});
