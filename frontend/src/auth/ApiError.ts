/** Erro de uma chamada à API interna. `status` é o código HTTP da resposta. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(`API respondeu ${status}`);
    this.name = 'ApiError';
  }
}
