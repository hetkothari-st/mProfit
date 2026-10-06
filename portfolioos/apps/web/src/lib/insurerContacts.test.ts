import { describe, it, expect } from 'vitest';
import { INSURER_CONTACTS } from '@/data/insurerContacts.generated';
import { insurerContactFor, phoneKind, telHref, whatsappHref } from './insurerContacts';

describe('insurer contact directory', () => {
  it('finds the insurer a policy names', () => {
    expect(insurerContactFor('HDFC Ergo Optima Secure')?.phones).toContain('022-6158-2020');
    expect(insurerContactFor('Star Health Family Optima')?.phones).toContain('1800 425 2255');
  });

  it('has nothing for insurers whose numbers could not be confirmed', () => {
    expect(insurerContactFor('Navi General')).toBeNull();
    expect(insurerContactFor('Niva Bupa ReAssure')).toBeNull();
    expect(insurerContactFor('Some Local Insurer')).toBeNull();
  });

  it('keeps out claim lines that conflicted on the insurer’s own site', () => {
    expect(insurerContactFor('LIC')?.claimsPhones).toEqual([]);
    expect(insurerContactFor('ICICI Prudential Life')?.claimsPhones).toEqual([]);
    expect(insurerContactFor('Reliance General')?.whatsapp).toBeNull();
  });

  it('records where every entry was checked, and links only over https', () => {
    for (const [slug, c] of Object.entries(INSURER_CONTACTS)) {
      expect(c.phones.length, slug).toBeGreaterThan(0);
      expect(c.source, slug).toMatch(/^https:\/\//);
      for (const u of [c.claimUrl, c.grievanceUrl]) if (u) expect(u, slug).toMatch(/^https:\/\//);
      expect(c.checkedOn, slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('phone helpers', () => {
  it('says which lines are free to call', () => {
    expect(phoneKind('1800 425 2255')).toBe('toll-free');
    expect(phoneKind('1860 500 3333')).toBe('shared-cost');
    expect(phoneKind('022-6158-2020')).toBe('standard');
  });

  it('dials correctly', () => {
    expect(telHref('+91-022 6827 6827')).toBe('tel:+912268276827');
    expect(telHref('1800-266-9777')).toBe('tel:18002669777');
    expect(whatsappHref('+91 8291890569')).toBe('https://wa.me/918291890569');
    expect(whatsappHref('93210 03007')).toBe('https://wa.me/919321003007');
  });
});
