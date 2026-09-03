import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import {
  AUTENTICADO_BASTA_KEY,
  IS_PUBLIC_KEY,
  PERM_METADATA_KEY,
} from '../auth.constants';
import { PERMISSAO_IDS, assertCatalogoCoerente } from './catalogo';

/** Lê metadata do handler; se ausente, do construtor da classe. */
function metaDoAlvo<T>(key: string, handler: object, classe: object | undefined): T | undefined {
  const noHandler = Reflect.getMetadata(key, handler) as T | undefined;
  if (noHandler !== undefined) return noHandler;
  return classe ? (Reflect.getMetadata(key, classe) as T | undefined) : undefined;
}

/**
 * Verificação de coerência RBAC no boot (FR-035 / FR-023):
 *  - `assertCatalogoCoerente()` (ids únicos, formato) — **aborta** em falha.
 *  - todo `@RequerPermissao('x')` registrado precisa de `x` no catálogo —
 *    **aborta** (erro de código, checagem impossível de satisfazer).
 *  - handlers HTTP sem nenhum marcador (`@Public` / `@AutenticadoBasta` /
 *    `@RequerPermissao`) → `warn` com a lista (não aborta na v1 — "fechado por
 *    omissão" já os nega em runtime).
 */
@Injectable()
export class RbacRouteAudit implements OnApplicationBootstrap {
  private readonly logger = new Logger('RbacRouteAudit');

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
  ) {}

  onApplicationBootstrap(): void {
    assertCatalogoCoerente();

    const semMarcador: string[] = [];
    const controllers = this.discovery.getControllers();

    for (const wrapper of controllers) {
      const instance = wrapper.instance as Record<string, unknown> | undefined;
      if (!instance) continue;
      const proto = Object.getPrototypeOf(instance) as object;
      const classe = wrapper.metatype as object | undefined;

      for (const nomeMetodo of this.scanner.getAllMethodNames(proto)) {
        const handler = (instance as Record<string, unknown>)[nomeMetodo];
        if (typeof handler !== 'function') continue;
        const isRota =
          Reflect.getMetadata(METHOD_METADATA, handler) !== undefined ||
          Reflect.getMetadata(PATH_METADATA, handler) !== undefined;
        if (!isRota) continue;

        const exigidas = metaDoAlvo<string[]>(PERM_METADATA_KEY, handler, classe);
        const isPublic = metaDoAlvo<boolean>(IS_PUBLIC_KEY, handler, classe);
        const autenticadoBasta = metaDoAlvo<boolean>(
          AUTENTICADO_BASTA_KEY,
          handler,
          classe,
        );

        if (exigidas && exigidas.length > 0) {
          for (const p of exigidas) {
            if (!PERMISSAO_IDS.has(p)) {
              throw new Error(
                `RBAC: @RequerPermissao("${p}") em ${wrapper.name}.${nomeMetodo} — permissão fora do catálogo`,
              );
            }
          }
          continue;
        }
        if (isPublic || autenticadoBasta) continue;
        semMarcador.push(`${wrapper.name}.${nomeMetodo}`);
      }
    }

    if (semMarcador.length > 0) {
      this.logger.warn(
        `handlers sem marcador RBAC (negados por omissão): ${semMarcador.join(', ')}`,
      );
    }
  }
}
