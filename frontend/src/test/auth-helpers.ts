/** JWT sintético (só as 3 partes base64url) — o painel só lê `exp`, não verifica. */
export function fakeJwt(expOffsetSeconds = 3600): string {
  const enc = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const now = Math.floor(Date.now() / 1000);
  return [
    enc({ alg: 'HS256', typ: 'JWT' }),
    enc({ sub: 'pandora-panel', iss: 'pandora', iat: now, exp: now + expOffsetSeconds }),
    'assinatura-ignorada',
  ].join('.');
}

/** Semeia um token válido no localStorage antes de montar o `AuthProvider`. */
export function semearToken(token = fakeJwt()): void {
  window.localStorage.setItem('pandora.token', token);
}
