import { timingSafeEqual } from 'node:crypto';

/**
 * Compara dois segredos em **tempo constante** — sem `return` antecipado no
 * primeiro byte divergente. Usada pela verificação de `client_secret`
 * (`POST /auth/token`) e pela verificação de `<PLATAFORMA>_WEBHOOK_TOKEN`
 * (`WebhookAuthenticator`) — os dois pontos onde um _timing oracle_ vazaria
 * informação sobre um segredo.
 *
 * `crypto.timingSafeEqual` exige buffers de mesmo comprimento (lança se
 * diferirem). Quando os comprimentos são diferentes o resultado já é `false`;
 * ainda assim comparamos `a` contra si mesmo para não transformar a checagem de
 * comprimento num atalho observável por _timing_ grosseiro.
 */
export function comparacaoConstante(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Toca um `timingSafeEqual` de mesmo tamanho e descarta o resultado.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
