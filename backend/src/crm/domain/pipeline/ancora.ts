/**
 * Âncora de `oportunidade` (spec 010, D-01): exatamente um de `pessoaId`/
 * `leadId`, mesma regra da `interacao` (spec 009) — reusada diretamente, sem
 * duplicar a lógica.
 */
export { validarAncora, type ResultadoAncora } from '../interacao/ancora';
