import { Injectable } from '@nestjs/common';
import {
  EntidadeId,
  OrigemMudanca,
  agoraUtc,
  montarRegistroAuditoria,
} from '../../core/core.module';
import { PrismaService } from '../../prisma/prisma.service';

export interface EntradaAuditoria {
  autor: string;
  entidade: 'perfil' | 'usuario';
  entidadeId: string;
  /** eixo da mudança: 'criado' | 'renomeado' | 'permissoes' | 'apagado' | 'perfis' */
  campo: string;
  valorAnterior: unknown;
  valorNovo: unknown;
  motivo: string;
}

/**
 * Grava ações administrativas de RBAC em `rbac_audit`, na forma canônica
 * `RegistroAuditoria` do `core` (spec 002). **Append-only**: sem UPDATE/DELETE.
 * Nunca recebe nem grava segredo/token/senha.
 */
@Injectable()
export class RbacAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(entrada: EntradaAuditoria): Promise<void> {
    const registro = montarRegistroAuditoria({
      autor: entrada.autor,
      quando: agoraUtc(),
      entidade: entrada.entidade,
      entidadeId: entrada.entidadeId,
      campo: entrada.campo,
      valorAnterior: entrada.valorAnterior,
      valorNovo: entrada.valorNovo,
      motivo: entrada.motivo,
      origem: OrigemMudanca.AJUSTE_MANUAL,
    });

    await this.prisma.rbacAudit.create({
      data: {
        id: EntidadeId.novo().value,
        autor: registro.autor,
        quando: registro.quando,
        entidade: registro.entidade,
        entidadeId: registro.entidadeId,
        campo: registro.campo,
        valorAnterior: (registro.valorAnterior ?? null) as never,
        valorNovo: (registro.valorNovo ?? null) as never,
        motivo: registro.motivo,
        origem: registro.origem,
      },
    });
  }
}
