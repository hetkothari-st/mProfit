import type { UserRole, PlanTier } from '@prisma/client';

declare global {
  namespace Express {
    interface AuthedUser {
      id: string;
      email: string;
      role: UserRole;
      plan: PlanTier;
    }
    interface Request {
      user?: AuthedUser;
    }
  }
}

export {};
