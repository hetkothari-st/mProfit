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
      /**
       * Whose data this request reads and writes. While a manager acts for a
       * managed family profile, this is the PROFILE (with the manager's plan),
       * so every service and every RLS policy sees the profile as the caller.
       */
      user?: AuthedUser;
      /**
       * Who is actually signed in, when that differs from `user` — set only
       * while acting for a managed profile. Anything that must know the real
       * person (audit, "who changed this") reads it from here.
       */
      actor?: AuthedUser;
    }
  }
}

export {};
