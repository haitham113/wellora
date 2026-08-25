import type { Request } from 'express';

import type { AuthPrincipal } from './auth-principal.js';

export interface AuthenticatedRequest extends Request {
  auth?: AuthPrincipal;
}
