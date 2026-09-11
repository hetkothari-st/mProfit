import { describe, it, expect, vi, beforeEach } from 'vitest';

// Bonds, crypto, forex, post office and NPS are optional sidebar sections:
// absent until the user adds them from "Add asset class". Absent, not hidden —
// the dashboard hides what the sidebar hides, and holdings in a class the
// user never added must still show there.

const db = vi.hoisted(() => ({ findUniqueOrThrow: vi.fn(), update: vi.fn() }));
vi.mock('../../src/lib/prisma.js', () => ({
  prisma: { user: { findUniqueOrThrow: db.findUniqueOrThrow, update: db.update } },
}));

import { OPTIONAL_ASSET_SECTION_KEYS } from '@portfolioos/shared';
import { getUserPreferences, updateUserPreferences } from '../../src/services/userPreferences.service.js';

const OPTIONAL = ['/bonds', '/crypto', '/forex', '/post-office', '/nps'];

beforeEach(() => vi.clearAllMocks());

describe('optional asset sections', () => {
  it('are bonds, crypto, forex, post office and NPS', () => {
    expect([...OPTIONAL_ASSET_SECTION_KEYS].sort()).toEqual([...OPTIONAL].sort());
  });

  it('are left out for a new user, while every core section is shown in order', async () => {
    db.findUniqueOrThrow.mockResolvedValue({ preferences: null });
    const { assetSections } = await getUserPreferences('u1');
    const keys = assetSections.map((s) => s.key);
    for (const k of OPTIONAL) expect(keys, k).not.toContain(k);
    expect(keys).toContain('/stocks');
    expect(keys).toContain('/mutual-funds');
    expect(assetSections.every((s) => s.visible)).toBe(true);
    expect(assetSections.map((s) => s.order)).toEqual(assetSections.map((_, i) => i));
  });

  it('stay once the user has added one', async () => {
    db.findUniqueOrThrow.mockResolvedValue({
      preferences: {
        assetSectionsVersion: 2,
        assetSections: [
          { key: '/stocks', visible: true, order: 0 },
          { key: '/crypto', visible: true, order: 1 },
        ],
      },
    });
    const keys = (await getUserPreferences('u1')).assetSections.map((s) => s.key);
    expect(keys.slice(0, 2)).toEqual(['/stocks', '/crypto']);
    expect(keys).not.toContain('/bonds');
  });

  it('are dropped once from preferences saved before they became optional, keeping other choices', async () => {
    db.findUniqueOrThrow.mockResolvedValue({
      preferences: {
        assetSections: [
          { key: '/crypto', visible: true, order: 0 },
          { key: '/stocks', visible: false, order: 1 },
        ],
      },
    });
    const sections = (await getUserPreferences('u1')).assetSections;
    expect(sections.map((s) => s.key)).not.toContain('/crypto');
    expect(sections[0]).toEqual({ key: '/stocks', visible: false, order: 0 });
  });

  it('are saved with the current version, so an added one is kept next time', async () => {
    db.update.mockResolvedValue({});
    await updateUserPreferences('u1', { assetSections: [{ key: '/crypto', visible: true, order: 0 }] });
    expect(db.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: { preferences: expect.objectContaining({ assetSectionsVersion: 2 }) },
      }),
    );
  });
});
