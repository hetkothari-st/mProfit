import type { NextFunction, Request, Response } from 'express';
import { prisma } from './prisma.js';
import { runAsSystem, sessionHasSecondFactor } from './requestContext.js';
import { AppError } from './errors.js';

/**
 * Acting on another person's money — the CA / adviser workspace — needs
 * two-factor sign-in: switched on for the account, AND used to sign in to
 * this session. Switched on alone isn't enough: a session from before it was
 * turned on, or a stolen password with an old session, must not get through.
 *
 * Enforced in getCaScope (every path to a client's data goes through it) and
 * on the CA routes that don't touch one client (list, invite, activity).
 * The client's own Account Access page is deliberately not gated: revoking a
 * professional must always work.
 */
export async function assertProfessionalSecondFactor(userId: string): Promise<void> {
  const user = await runAsSystem(() =>
    prisma.user.findUnique({ where: { id: userId }, select: { twoFactorEnabledAt: true, twoFactorSecretEnc: true } }),
  );
  if (!user?.twoFactorEnabledAt || !user.twoFactorSecretEnc) {
    throw new AppError(
      'Turn on two-factor sign-in (Settings) to use the professional workspace. It protects your clients’ data.',
      403,
      'TWO_FACTOR_REQUIRED',
      { reason: 'not_enabled' },
    );
  }
  if (!sessionHasSecondFactor()) {
    throw new AppError(
      'Sign out and sign in again with your authenticator code to use the professional workspace.',
      403,
      'TWO_FACTOR_REQUIRED',
      { reason: 'sign_in_again' },
    );
  }
}

export function requireProfessionalSecondFactor(req: Request, _res: Response, next: NextFunction): void {
  // Under X-Act-As the manager's own session is what was verified; the gate is
  // about the person at the keyboard.
  const userId = req.actor?.id ?? req.user?.id;
  if (!userId) {
    next(new AppError('Not signed in', 401, 'UNAUTHORIZED'));
    return;
  }
  assertProfessionalSecondFactor(userId).then(() => next(), next);
}
