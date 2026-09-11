import { OPTIONAL_ASSET_SECTION_KEYS, type AssetSectionPref, type UserPreferences } from '@portfolioos/shared';
import { prisma } from '../lib/prisma.js';

/**
 * Master list of asset class nav keys — must match ASSET_CLASS_ITEMS in
 * navItems.tsx. New core sections added here auto-appear in existing users'
 * sidebars; optional ones (OPTIONAL_ASSET_SECTION_KEYS) appear only once the
 * user adds them.
 */
const ASSET_SECTION_KEYS: string[] = [
  '/bank-accounts',
  '/stocks',
  '/fo',
  '/mutual-funds',
  '/bonds',
  '/fds',
  '/gold',
  '/crypto',
  '/forex',
  '/provident-fund',
  '/nps',
  '/post-office',
  '/real-estate',
  '/rental',
  '/vehicles',
  '/insurance',
  '/loans',
  '/credit-cards',
  '/others',
];

const OPTIONAL = new Set<string>(OPTIONAL_ASSET_SECTION_KEYS);

/**
 * Version of the saved sections' meaning. 2: optional sections are opt-in.
 * Preferences saved before that listed every section by default, so an
 * optional one in them was never chosen — it is dropped once, on read.
 */
const ASSET_SECTIONS_VERSION = 2;

/**
 * Saved sections in their saved order, then any core section the user has not
 * seen yet (visible, last). Orders are renumbered to stay 0-based and dense.
 */
function mergeWithDefaults(saved: AssetSectionPref[] | null, version: number): AssetSectionPref[] {
  const kept = (saved ?? []).filter(
    (s) => ASSET_SECTION_KEYS.includes(s.key) && (version >= ASSET_SECTIONS_VERSION || !OPTIONAL.has(s.key)),
  );
  const present = new Set(kept.map((s) => s.key));
  const merged: AssetSectionPref[] = [...kept];
  for (const key of ASSET_SECTION_KEYS) {
    if (!present.has(key) && !OPTIONAL.has(key)) merged.push({ key, visible: true, order: 0 });
  }
  return merged.map((s, i) => ({ key: s.key, visible: s.visible, order: i }));
}

/**
 * Get user preferences, merging with defaults for any new sections.
 */
export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { preferences: true },
  });

  const raw = user.preferences as { assetSections?: AssetSectionPref[]; assetSectionsVersion?: number } | null;
  const version = typeof raw?.assetSectionsVersion === 'number' ? raw.assetSectionsVersion : 1;
  const assetSections = mergeWithDefaults(raw?.assetSections ?? null, version);
  return { assetSections };
}

/**
 * Update user preferences. Stamped with the current version, so an optional
 * section the user added is kept on the next read.
 */
export async function updateUserPreferences(
  userId: string,
  prefs: UserPreferences,
): Promise<UserPreferences> {
  await prisma.user.update({
    where: { id: userId },
    data: { preferences: { ...prefs, assetSectionsVersion: ASSET_SECTIONS_VERSION } as object },
  });
  return prefs;
}
