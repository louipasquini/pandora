import { createHmac } from 'node:crypto';
import { compararTokenConstante, verificarAssinatura } from './assinatura';

function assinar(corpo: Buffer, segredo: string): string {
  return `sha256=${createHmac('sha256', segredo).update(corpo).digest('hex')}`;
}

describe('verificarAssinatura', () => {
  const segredo = 'segredo-de-teste';
  const corpo = Buffer.from('{"hello":"world"}', 'utf8');

  it('HMAC correto → válido', () => {
    expect(verificarAssinatura(corpo, assinar(corpo, segredo), segredo)).toBe(true);
  });

  it('corpo alterado em 1 byte → inválido', () => {
    const assinatura = assinar(corpo, segredo);
    const corpoAlterado = Buffer.from('{"hello":"worle"}', 'utf8');
    expect(verificarAssinatura(corpoAlterado, assinatura, segredo)).toBe(false);
  });

  it('appSecret errado → inválido', () => {
    expect(verificarAssinatura(corpo, assinar(corpo, segredo), 'outro-segredo')).toBe(false);
  });

  it('header ausente → inválido', () => {
    expect(verificarAssinatura(corpo, undefined, segredo)).toBe(false);
  });

  it('header sem prefixo sha256= → inválido', () => {
    expect(verificarAssinatura(corpo, 'abc123', segredo)).toBe(false);
  });

  it('header com hex inválido → inválido', () => {
    expect(verificarAssinatura(corpo, 'sha256=zz', segredo)).toBe(false);
  });
});

describe('compararTokenConstante', () => {
  it('valores iguais → true', () => {
    expect(compararTokenConstante('abc', 'abc')).toBe(true);
  });
  it('valores diferentes → false', () => {
    expect(compararTokenConstante('abc', 'abd')).toBe(false);
  });
  it('comprimentos diferentes → false', () => {
    expect(compararTokenConstante('abc', 'abcd')).toBe(false);
  });
});
