import { Classificacao } from '@prisma/client';
import { StatusTransacaoCanonico, contaComoReceita } from '../../../core/core.module';

/**
 * Regra "só a Guru soma receita" (spec 024, CL-03) como **função de leitura pura** —
 * nunca um efeito colateral de escrita, nunca uma coluna "conta como receita" nova
 * (Princípio V). Uma transação Asaas terceirizada é reclassificada para
 * `COBRANCA_TERCEIRIZADA` quando o vínculo é resolvido (`TentarVincularService`); a
 * partir daí ela deixa de contar mesmo que o status de pagamento seja `PAGO`.
 */
export function pagoDeFatoTransacao(
  statusCanonico: string,
  classificacao: string,
): boolean {
  return (
    contaComoReceita(statusCanonico as StatusTransacaoCanonico) &&
    classificacao !== Classificacao.COBRANCA_TERCEIRIZADA
  );
}
