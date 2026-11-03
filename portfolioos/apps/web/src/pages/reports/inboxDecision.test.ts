import { describe, it, expect } from 'vitest';
import type { GmailDiscoveredDocDTO } from '@everypaisa/shared';
import { applyInboxDecision, otherPendingFromSender } from './inboxDecision';

const doc = (id: string, fromAddress: string, status = 'PENDING_APPROVAL') =>
  ({ id, fromAddress, status }) as unknown as GmailDiscoveredDocDTO;

const CAMS = 'donotreply@camsonline.com';
const list = [doc('a', CAMS), doc('b', CAMS), doc('c', 'alerts@hdfcbank.net'), doc('d', CAMS, 'IMPORTED')];
const fromCams = (d: GmailDiscoveredDocDTO) => d.fromAddress === CAMS;

describe('applyInboxDecision', () => {
  it('approving a sender leaves the Pending tab at once with only other senders', () => {
    const after = applyInboxDecision(list.slice(0, 3), fromCams, 'APPROVE', 'PENDING_APPROVAL');
    expect(after.map((d) => d.id)).toEqual(['c']);
  });

  it('in the All tab the sender’s pending documents change status; finished ones do not', () => {
    const after = applyInboxDecision(list, fromCams, 'REJECT', undefined);
    expect(after.map((d) => [d.id, d.status])).toEqual([
      ['a', 'REJECTED'],
      ['b', 'REJECTED'],
      ['c', 'PENDING_APPROVAL'],
      ['d', 'IMPORTED'],
    ]);
  });

  it('a single document decision touches that document only', () => {
    const after = applyInboxDecision(list, (d) => d.id === 'a', 'APPROVE', undefined);
    expect(after.map((d) => d.status)).toEqual(['IMPORTING', 'PENDING_APPROVAL', 'PENDING_APPROVAL', 'IMPORTED']);
  });
});

describe('otherPendingFromSender', () => {
  it('counts the sender’s other documents still waiting', () => {
    expect(otherPendingFromSender(list, list[0]!)).toBe(1);
    expect(otherPendingFromSender(list, list[2]!)).toBe(0);
  });
});
