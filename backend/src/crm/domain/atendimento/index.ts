export { escolherAtendentePorCarga, type CandidatoRoteamento } from './roteamento';
export {
  calcularSlaAtendimento,
  type AtendimentoSlaEntrada,
  type AtendimentoSlaResultado,
  type AtendimentoStatusSla,
} from './sla';
export { ordenarFila, type AtendimentoPrioridade } from './fila';
export { csatElegivel, interpretarRespostaCsat, type AtendimentoStatusCsat } from './csat';
