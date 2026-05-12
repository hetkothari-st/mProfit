import type { AssetSectionPref, UserPreferences } from '@portfolioos/shared';
import { prisma } from '../lib/prisma.js';

/**
 * Master list of asset class nav keys — must match NAV_SECTIONS in Sidebar.tsx.
 * New asset sections added here will auto-appear in existing users' sidebars.
 */
const ASSET_SECTION_KEYS: string[] = [
  '/stocks',
  '/fo',
  '/mutual-funds',
  '/bonds',
  '/fds',
  '/gold',
  '/crypto',
  '/forex',
  '/provident-fund',
  '/post-office',
  '/real-estate',
  '/rental',
  '/vehicles',
  '/insurance',
  '/loans',
  '/credit-cards',
  '/others',
];

/**
 * Merges saved preferences with the master list of sidebar items.
 * Ensures new items appear as visible+last for users who haven't seen them before.
 */
function mergeWithDefaults(saved: AssetSectionPref[] | null): AssetSectionPref[] {
  const existing = new Map((saved ?? []).map((s) => [s.key, s]));
  const merged: AssetSectionPref[] = [];

  // Add saved items in their saved order.
  for (const item of saved ?? []) {
    if (ASSET_SECTION_KEYS.includes(item.key)) {
      merged.push(item);
    }
  }

  // Append any master keys not yet in saved prefs (new items).
  let nextOrder = merged.length;
  for (const key of ASSET_SECTION_KEYS) {
    if (!existing.has(key)) {
      merged.push({ key, visible: true, order: nextOrder++ });
    }
  }

  return merged;
}

/**
 * Get user preferences, merging with defaults for any new sections.
 */
export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { preferences: true },
  });

  const raw = user.preferences as { assetSections?: AssetSectionPref[] } | null;
  const assetSections = mergeWithDefaults(raw?.assetSections ?? null);
  return { assetSections };
}

/**
 * Update user preferences.
 */
export async function updateUserPreferences(
  userId: string,
  prefs: UserPreferences,
): Promise<UserPreferences> {
  await prisma.user.update({
    where: { id: userId },
    data: { preferences: prefs as object },
  });
  return prefs;
}
