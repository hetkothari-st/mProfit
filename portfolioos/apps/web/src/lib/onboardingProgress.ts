/**
 * Whether a given account left onboarding unfinished, so signing in again
 * takes it back to setup instead of the dashboard.
 *
 * Keyed by user id, not per browser like `onboarding_v2_done`: an account
 * that started setup and walked away should resume it, whichever account
 * last used this browser. Only an explicit start sets it, so accounts that
 * never saw the new onboarding are never sent there.
 *
 * Stored in this browser only — a different device won't know.
 */
const key = (userId: string) => `everypaisa.onboarding.inProgress.${userId}`;

export function markOnboardingStarted(userId: string): void {
  try {
    localStorage.setItem(key(userId), '1');
  } catch {
    // Storage blocked: resuming is a convenience, the flow still works.
    return;
  }
}

export function markOnboardingFinished(userId: string): void {
  try {
    localStorage.removeItem(key(userId));
  } catch {
    return;
  }
}

export function isOnboardingUnfinished(userId: string | null | undefined): boolean {
  if (!userId) return false;
  try {
    return localStorage.getItem(key(userId)) === '1';
  } catch {
    return false;
  }
}
