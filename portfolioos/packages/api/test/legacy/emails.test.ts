import { describe, it, expect } from 'vitest';
import { renderLegacyEmail, type OutboxKind } from '../../src/services/legacy/emails.js';

const KINDS: OutboxKind[] = ['INVITE', 'WARNING_1', 'WARNING_2', 'FINAL_WARNING', 'GRACE_OWNER', 'GRACE_NOMINEE', 'VERIFY',
  'RELEASED_NOMINEE', 'RELEASED_OWNER', 'RESET_NOMINEE', 'REVOKED_NOMINEE', 'VERIFIER_VOUCHED_OWNER', 'SCHEDULE_30', 'SCHEDULE_7', 'SCHEDULE_1'];

describe('legacy emails', () => {
  it.each(KINDS)('%s renders subject, html and text', (k) => {
    const e = renderLegacyEmail(k, { ownerName: 'Asha', recipientName: 'Ravi', link: 'https://x/l/abc', date: '1 Apr 2027', appUrl: 'https://x' });
    expect(e.subject.length).toBeGreaterThan(5);
    expect(e.text).toContain('Ravi');
  });
  it('escapes HTML in names', () => {
    const e = renderLegacyEmail('INVITE', { ownerName: '<b>A</b>', recipientName: 'R', link: 'https://x', date: null, appUrl: 'https://x' });
    expect(e.html).not.toContain('<b>A</b>');
  });
  it("owner warnings carry the I'm OK link; nominee invite never mentions amounts", () => {
    const w = renderLegacyEmail('WARNING_1', { ownerName: 'A', recipientName: 'A', link: 'https://x/ok', date: null, appUrl: 'https://x' });
    expect(w.html).toContain('https://x/ok');
    const i = renderLegacyEmail('INVITE', { ownerName: 'A', recipientName: 'R', link: 'https://x/ack', date: null, appUrl: 'https://x' });
    expect(i.text).not.toMatch(/₹|balance|net worth/i);
  });
});
