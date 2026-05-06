/**
 * storage.ts — Typed wrapper over chrome.storage.local.
 *
 * All extension state lives here. Callers never touch chrome.storage directly.
 */

const KEYS = {
  apiBase: 'apiBase',
  bearer: 'bearer',
  userId: 'userId',
} as const;

// Default API base — override via popup or post-install config.
// Must be set to the actual Railway deployment URL before pairing works.
const DEFAULT_API_BASE = 'https://your-railway-domain.up.railway.app';

export async function getApiBase(): Promise<string> {
  const r = await chrome.storage.local.get(KEYS.apiBase);
  return (r[KEYS.apiBase] as string | undefined) ?? DEFAULT_API_BASE;
}

export async function setApiBase(url: string): Promise<void> {
  await chrome.storage.local.set({ [KEYS.apiBase]: url });
}

export async function getBearer(): Promise<string | undefined> {
  const r = await chrome.storage.local.get(KEYS.bearer);
  return r[KEYS.bearer] as string | undefined;
}

export async function setBearer(token: string, userId: string): Promise<void> {
  await chrome.storage.local.set({ [KEYS.bearer]: token, [KEYS.userId]: userId });
}

export async function clearBearer(): Promise<void> {
  await chrome.storage.local.remove([KEYS.bearer, KEYS.userId]);
}

export async function getUserId(): Promise<string | undefined> {
  const r = await chrome.storage.local.get(KEYS.userId);
  return r[KEYS.userId] as string | undefined;
}
