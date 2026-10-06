/**
 * The app was called PortfolioOS, and every localStorage key it wrote was
 * prefixed `portfolioos.` — the signed-in session, theme, privacy mode, family
 * scope, dismissed banners, list views. The keys are now `everypaisa.`.
 *
 * Moving each old key to its new name once, before any store hydrates, keeps
 * people signed in and keeps their settings. Imported first in main.tsx so it
 * runs ahead of the zustand `persist` stores.
 */
const LEGACY_PREFIX = 'portfolioos.';
const PREFIX = 'everypaisa.';

export function migrateLegacyStorageKeys(storage: Storage): void {
  const legacy: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(LEGACY_PREFIX)) legacy.push(key);
  }
  for (const key of legacy) {
    const next = PREFIX + key.slice(LEGACY_PREFIX.length);
    const value = storage.getItem(key);
    if (value !== null && storage.getItem(next) === null) storage.setItem(next, value);
    storage.removeItem(key);
  }
}

try {
  migrateLegacyStorageKeys(window.localStorage);
  // eslint-disable-next-line everypaisa/no-silent-catch -- storage blocked (private mode, disabled site data): nothing to carry over
} catch { /* nothing to migrate */ }
