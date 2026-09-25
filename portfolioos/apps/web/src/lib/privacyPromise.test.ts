import { describe, it, expect } from 'vitest';
import { PRIVACY_PROMISE, PRIVACY_ONE_LINER, STORAGE_MODE } from './privacyPromise';

/**
 * The privacy copy is a claim about where the data physically is. It has to
 * follow the architecture, never lead it: telling somebody their portfolio
 * never leaves their phone while rows are being written to Postgres is a
 * false statement made to a person about their money.
 *
 * These are the two halves of that: the copy shown matches the mode, and the
 * hosted copy never borrows the device claim.
 */

const DEVICE_CLAIMS = [
  /stays on your device/i,
  /never leaves the device/i,
  /not uploaded/i,
  /we never see it/i,
  /could not read your portfolio/i,
];

describe('the privacy promise', () => {
  it('says only what the current storage mode allows', () => {
    const shown = [PRIVACY_PROMISE.headline, PRIVACY_PROMISE.body, ...PRIVACY_PROMISE.points]
      .join(' ')
      .toLowerCase();
    if (STORAGE_MODE === 'device') {
      expect(shown).toMatch(/device/);
      return;
    }
    // Hosted: the data is on our servers, and the copy must not suggest
    // otherwise, however it gets edited later.
    for (const claim of DEVICE_CLAIMS) {
      expect(shown, `hosted copy must not claim: ${claim}`).not.toMatch(claim);
    }
    expect(PRIVACY_ONE_LINER.toLowerCase()).not.toMatch(/stays on your device/);
  });

  it('is specific enough to be checked, rather than a mood', () => {
    expect(PRIVACY_PROMISE.points.length).toBeGreaterThanOrEqual(4);
    const all = PRIVACY_PROMISE.points.join(' ').toLowerCase();
    // The commitments a reader can actually hold us to.
    expect(all).toMatch(/encrypt|end-to-end/);
    expect(all).toMatch(/never sold|not sold/);
    expect(all).toMatch(/export/);
    expect(all).toMatch(/delete/);
  });

  it('promises deletion of the data, not merely of the login', () => {
    const all = `${PRIVACY_PROMISE.body} ${PRIVACY_PROMISE.points.join(' ')}`.toLowerCase();
    expect(all).toMatch(/delete/);
    expect(all).not.toMatch(/deactivat/); // a euphemism for keeping it
  });
});
