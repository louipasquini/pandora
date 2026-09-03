import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../auth.constants';

/**
 * Marca um handler (ou um controller inteiro) como **público** — isento do
 * `JwtAuthGuard` global. Uso deliberado e revisável em diff (FR-011); hoje só em
 * `HealthController.check` e `AuthController.token`.
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
