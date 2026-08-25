import type { PlatformRole } from '../../generated/prisma/enums.js';

export interface AuthPrincipal {
  userId: string;
  sessionId: string;
  platformRole: PlatformRole | null;
}
