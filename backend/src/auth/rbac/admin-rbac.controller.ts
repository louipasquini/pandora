import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from '../guards/jwt-auth.guard';
import { RequerPermissao } from './decorators/requer-permissao.decorator';
import { agruparPorRecurso } from './catalogo';
import { calcularDelta } from './calcular-delta';
import { RbacRepository } from './rbac.repository';
import { RbacAuditService } from './rbac-audit.service';
import { criarPerfilSchema, editarPerfilSchema } from './dto/perfil.schema';
import {
  criarUsuarioSchema,
  normalizarEmail,
  normalizarNome,
  putPerfisSchema,
} from './dto/usuario.schema';

function autor(req: Request): string {
  return (req as Request & { auth?: AuthContext }).auth?.sub ?? 'desconhecido';
}

/**
 * Administração do RBAC (spec 004). Classe inteira sob `perfil:administrar`.
 * Toda escrita grava `rbac_audit` (só _delta_ real).
 */
@Controller('admin/rbac')
@RequerPermissao('perfil:administrar')
export class AdminRbacController {
  constructor(
    private readonly repo: RbacRepository,
    private readonly audit: RbacAuditService,
  ) {}

  // --- catálogo ---

  @Get('permissoes')
  permissoes() {
    return { recursos: agruparPorRecurso() };
  }

  // --- perfis ---

  @Get('perfis')
  async listarPerfis() {
    return { perfis: await this.repo.listarPerfis() };
  }

  @Post('perfis')
  @HttpCode(201)
  async criarPerfil(@Body() body: unknown, @Req() req: Request) {
    const parsed = criarPerfilSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(mensagemZod(parsed.error));
    }
    const nomeNormalizado = normalizarNome(parsed.data.nome);
    if (await this.repo.perfilPorNomeNormalizado(nomeNormalizado)) {
      throw new ConflictException('já existe um perfil com esse nome');
    }
    const perfil = await this.repo.criarPerfil({
      nome: parsed.data.nome,
      nomeNormalizado,
      permissoes: parsed.data.permissoes,
    });
    await this.audit.registrar({
      autor: autor(req),
      entidade: 'perfil',
      entidadeId: perfil.id,
      campo: 'criado',
      valorAnterior: null,
      valorNovo: { nome: perfil.nome, permissoes: perfil.permissoes },
      motivo: 'perfil criado via POST /admin/rbac/perfis',
    });
    return perfil;
  }

  @Patch('perfis/:id')
  async editarPerfil(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const parsed = editarPerfilSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(mensagemZod(parsed.error));
    }
    const atual = await this.repo.perfilDetalhe(id);
    if (!atual) throw new NotFoundException('perfil não encontrado');
    if (atual.deSistema) {
      throw new ConflictException('perfil de sistema é imutável');
    }

    if (parsed.data.nome !== undefined && parsed.data.nome !== atual.nome) {
      const nomeNormalizado = normalizarNome(parsed.data.nome);
      const colisao = await this.repo.perfilPorNomeNormalizado(nomeNormalizado);
      if (colisao && colisao.id !== id) {
        throw new ConflictException('já existe um perfil com esse nome');
      }
      await this.repo.renomearPerfil(id, parsed.data.nome, nomeNormalizado);
      await this.audit.registrar({
        autor: autor(req),
        entidade: 'perfil',
        entidadeId: id,
        campo: 'renomeado',
        valorAnterior: { nome: atual.nome },
        valorNovo: { nome: parsed.data.nome },
        motivo: 'perfil renomeado via PATCH /admin/rbac/perfis',
      });
    }

    if (parsed.data.permissoes !== undefined) {
      const delta = calcularDelta(atual.permissoes, parsed.data.permissoes);
      if (delta) {
        await this.repo.setPermissoesPerfil(id, parsed.data.permissoes);
        await this.audit.registrar({
          autor: autor(req),
          entidade: 'perfil',
          entidadeId: id,
          campo: 'permissoes',
          valorAnterior: { permissoes: atual.permissoes },
          valorNovo: { permissoes: [...parsed.data.permissoes].sort() },
          motivo: 'permissões do perfil alteradas via PATCH /admin/rbac/perfis',
        });
      }
    }

    return (await this.repo.perfilDetalhe(id))!;
  }

  @Delete('perfis/:id')
  @HttpCode(204)
  async apagarPerfil(@Param('id') id: string, @Req() req: Request) {
    const atual = await this.repo.perfilDetalhe(id);
    if (!atual) throw new NotFoundException('perfil não encontrado');
    if (atual.deSistema) {
      throw new ConflictException('perfil de sistema é imutável');
    }
    if (atual.totalUsuarios > 0) {
      throw new ConflictException({
        message: 'perfil em uso',
        totalUsuarios: atual.totalUsuarios,
      });
    }
    await this.repo.apagarPerfil(id);
    await this.audit.registrar({
      autor: autor(req),
      entidade: 'perfil',
      entidadeId: id,
      campo: 'apagado',
      valorAnterior: { nome: atual.nome, permissoes: atual.permissoes },
      valorNovo: null,
      motivo: 'perfil apagado via DELETE /admin/rbac/perfis',
    });
  }

  // --- usuários ---

  @Get('usuarios')
  async listarUsuarios() {
    return { usuarios: await this.repo.listarUsuarios() };
  }

  @Post('usuarios')
  @HttpCode(201)
  async criarUsuario(@Body() body: unknown, @Req() req: Request) {
    const parsed = criarUsuarioSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(mensagemZod(parsed.error));
    }
    const emailNormalizado = normalizarEmail(parsed.data.email);
    if (await this.repo.usuarioPorEmailNormalizado(emailNormalizado)) {
      throw new ConflictException('já existe um usuário com esse e-mail');
    }
    const usuario = await this.repo.criarUsuario({
      nome: parsed.data.nome,
      email: parsed.data.email,
      emailNormalizado,
    });
    await this.audit.registrar({
      autor: autor(req),
      entidade: 'usuario',
      entidadeId: usuario.id,
      campo: 'criado',
      valorAnterior: null,
      valorNovo: { nome: usuario.nome, email: usuario.email },
      motivo: 'usuário criado via POST /admin/rbac/usuarios',
    });
    return usuario;
  }

  @Get('usuarios/:id/perfis')
  async perfisDoUsuario(@Param('id') id: string) {
    if (!(await this.repo.usuarioPorId(id))) {
      throw new NotFoundException('usuário não encontrado');
    }
    return { perfis: await this.repo.perfisDoUsuarioComNome(id) };
  }

  @Put('usuarios/:id/perfis')
  async setPerfisDoUsuario(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const parsed = putPerfisSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(mensagemZod(parsed.error));
    }
    if (!(await this.repo.usuarioPorId(id))) {
      throw new NotFoundException('usuário não encontrado');
    }
    const existentes = await this.repo.perfilIdsExistentes(parsed.data.perfilIds);
    const inexistente = parsed.data.perfilIds.find((pid) => !existentes.has(pid));
    if (inexistente) {
      throw new NotFoundException(`perfil não encontrado: ${inexistente}`);
    }

    const atuais = await this.repo.perfisDoUsuarioIds(id);
    const delta = calcularDelta(atuais, parsed.data.perfilIds);
    if (delta) {
      await this.repo.setPerfisDoUsuario(id, parsed.data.perfilIds);
      await this.audit.registrar({
        autor: autor(req),
        entidade: 'usuario',
        entidadeId: id,
        campo: 'perfis',
        valorAnterior: { perfilIds: [...atuais].sort() },
        valorNovo: { perfilIds: [...parsed.data.perfilIds].sort() },
        motivo: 'perfis do usuário alterados via PUT /admin/rbac/usuarios/{id}/perfis',
      });
    }
    return { perfis: await this.repo.perfisDoUsuarioComNome(id) };
  }
}

function mensagemZod(err: import('zod').ZodError): string {
  // mensagem curta; não ecoa o catálogo inteiro
  return err.issues[0]?.message ?? 'corpo inválido';
}
