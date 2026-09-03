/**
 * Lê `exp` (segundos epoch) do payload de um JWT **sem verificar a assinatura** —
 * o cliente não tem o segredo e não é o seu papel. Uso único: logout proativo,
 * para não disparar uma chamada que já se sabe que dará 401.
 */
export function lerExp(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const obj = JSON.parse(json) as { exp?: unknown };
    return typeof obj.exp === 'number' ? obj.exp : null;
  } catch {
    return null;
  }
}

/**
 * `true` se o token já expirou (com margem de folga) ou se não tem `exp`
 * legível — nos dois casos o painel deve se tratar como deslogado.
 */
export function expirado(token: string, margemSegundos = 5): boolean {
  const exp = lerExp(token);
  if (exp === null) return true;
  return exp * 1000 <= Date.now() + margemSegundos * 1000;
}
