import { EntidadeId } from './entidade-id';
import { uuidv7 } from './uuid';

describe('EntidadeId', () => {
  it('gera um novo ID que é UUID v7', () => {
    const id = EntidadeId.novo();
    expect(id.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('gera valores distintos a cada chamada', () => {
    const a = EntidadeId.novo();
    const b = EntidadeId.novo();
    expect(a.value).not.toBe(b.value);
  });

  it('faz round-trip gera -> serializa -> reidrata', () => {
    const original = EntidadeId.novo();
    const reidratado = EntidadeId.de(original.toDb());
    expect(reidratado.equals(original)).toBe(true);
    expect(reidratado.value).toBe(original.value);
  });

  it('igualdade é por valor, não por referência', () => {
    const raw = uuidv7();
    expect(new EntidadeId(raw).equals(new EntidadeId(raw))).toBe(true);
    expect(EntidadeId.novo().equals(EntidadeId.novo())).toBe(false);
  });

  it('normaliza para minúsculas', () => {
    const raw = uuidv7().toUpperCase();
    expect(new EntidadeId(raw).value).toBe(raw.toLowerCase());
  });

  it('rejeita UUID v4', () => {
    // v4 tem o dígito de versão = 4
    expect(() => new EntidadeId('9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d')).toThrow(TypeError);
  });

  it('rejeita lixo e vazio', () => {
    expect(() => new EntidadeId('não é uuid')).toThrow(TypeError);
    expect(() => new EntidadeId('')).toThrow(TypeError);
    // @ts-expect-error teste de robustez com tipo errado
    expect(() => new EntidadeId(undefined)).toThrow(TypeError);
  });

  it('isValido reflete a regra de versão 7', () => {
    expect(EntidadeId.isValido(uuidv7())).toBe(true);
    expect(EntidadeId.isValido('9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d')).toBe(false);
    expect(EntidadeId.isValido(42)).toBe(false);
  });
});
