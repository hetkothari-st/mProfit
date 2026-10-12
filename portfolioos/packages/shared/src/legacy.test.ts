import { describe, it, expect } from 'vitest';
import { hasFeature } from './entitlements.js';
import { LEGACY_CATEGORIES, LEGACY_CATEGORY_LABELS, LEGACY_CLAIM_CHECKLIST, LEGACY_MIN_INACTIVITY_DAYS } from './legacy.js';

describe('legacy shared', () => {
  it('gates LEGACY_TRANSFER at PLUS', () => {
    expect(hasFeature('FREE', 'LEGACY_TRANSFER')).toBe(false);
    expect(hasFeature('PLUS', 'LEGACY_TRANSFER')).toBe(true);
    expect(hasFeature('FAMILY', 'LEGACY_TRANSFER')).toBe(true);
  });
  it('labels and checklists every category', () => {
    for (const c of LEGACY_CATEGORIES) {
      expect(LEGACY_CATEGORY_LABELS[c]).toBeTruthy();
      expect(Array.isArray(LEGACY_CLAIM_CHECKLIST[c])).toBe(true);
    }
    expect(LEGACY_MIN_INACTIVITY_DAYS).toBe(30);
  });
});
