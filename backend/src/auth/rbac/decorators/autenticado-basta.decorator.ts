import { SetMetadata } from '@nestjs/common';
import { AUTENTICADO_BASTA_KEY } from '../../auth.constants';

/**
 * Marca um handler autenticado que **não** exige permissão específica — só um JWT
 * válido. Torna explícita (e revisável em _diff_) a exceção à política "negar por
 * omissão" do `PermissionGuard` (CL-03).
 */
export const AutenticadoBasta = () => SetMetadata(AUTENTICADO_BASTA_KEY, true);
