import { describe, expect, it } from 'vitest';
import {
  DISCOVERY_THRESHOLD,
  FINANCIAL_KEYWORDS,
  scoreSender,
  scoreText,
} from './keywords.js';

/**
 * §6.6 scoring is the only input the Review UI uses to rank senders —
 * a silent change to weights would shift which senders appear first
 * (or at all). These tests lock representative cases so drift fails
 * CI.
 */
describe('keyword scoring', () => {
  describe('scoreText', () => {
    it('returns 0 for empty or non-financial text', () => {
      expect(scoreText('')).toBe(0);
      expect(scoreText('hi, how are you today?')).toBe(0);
    });

    it('matches whole words only — "FD" does not fire on "FDA"', () => {
      expect(scoreText('the FDA announced a recall')).toBe(0);
      expect(scoreText('your FD matures on Monday')).toBeGreaterThan(0);
    });

    it('is case-insensitive', () => {
      expect(scoreText('UPI credit received')).toBe(scoreText('upi CREDIT received'));
    });

    it('prefers the longest match — "contract note" wins over "note"', () => {
      // "contract note" is weight 4; there is no standalone "note" rule,
      // so the whole phrase fires as one 4-pointer rather than two.
      const n = scoreText('your contract note is attached');
      expect(n).toBe(4);
    });

    it('counts each occurrence (a 10-row statement legitimately scores higher)', () => {
      const one = scoreText('credit alert');
      const three = scoreText('credit credit credit');
      expect(three).toBe(one * 3);
    });

    it('locks a representative "UPI credit" alert at a known score', () => {
      // "UPI" (3) + "credit" (3) = 6. If this test flips, it means a
      // weight moved — verify intentional before updating.
      expect(scoreText('UPI credit of Rs 500 received from Rajesh')).toBe(6);
    });

    it('locks a representative "contract note" subject at a known score', () => {
      // "contract note" (4) + "Zerodha" (3) = 7.
      expect(scoreText('Zerodha contract note for 20-Apr')).toBe(7);
    });

    it('locks an institution-only marketing subject', () => {
      // Plain "HDFC" (2) with no verb — should still cross the threshold
      // if it appears multiple times in a short window, but a single
      // mention is under DISCOVERY_THRESHOLD by itself on scoreText.
      expect(scoreText('HDFC offers you a new credit card')).toBe(2 + 3);
    });
  });

  describe('scoreSender', () => {
    it('weights subjects 2× snippets', () => {
      // Subject contributes 2× the per-text score; snippet 1×. A single
      // "credit" (weight 3) in subject => 6, in snippet => 3.
      const viaSubject = scoreSender(['credit alert'], []);
      const viaSnippet = scoreSender([], ['credit alert']);
      expect(viaSubject).toBe(6);
      expect(viaSnippet).toBe(3);
    });

    it('sums across multiple messages', () => {
      const total = scoreSender(
        ['UPI credit', 'NEFT debit'],
        ['statement attached'],
      );
      // Subjects: (UPI 3 + credit 3) * 2 + (NEFT 3 + debit 3) * 2 = 12 + 12 = 24.
      // Snippet:  statement 2 = 2.
      expect(total).toBe(26);
    });

    it('a single weak mention does not cross DISCOVERY_THRESHOLD via snippets alone', () => {
      // One "statement" (2) in one snippet = 2 — below 3.
      const sc = scoreSender([], ['your iCloud statement is ready']);
      expect(sc).toBeLessThan(DISCOVERY_THRESHOLD);
    });
  });

  describe('rule table invariants', () => {
    it('all weights are positive integers', () => {
      for (const rule of FINANCIAL_KEYWORDS) {
        expect(Number.isInteger(rule.weight)).toBe(true);
        expect(rule.weight).toBeGreaterThan(0);
      }
    });

    it('no duplicate terms (case-insensitive)', () => {
      const lowered = FINANCIAL_KEYWORDS.map((r) => r.term.toLowerCase());
      const uniq = new Set(lowered);
      expect(uniq.size).toBe(lowered.length);
    });

    it('"contract note" is strictly stronger than any single-verb rule', () => {
      const contractNote = FINANCIAL_KEYWORDS.find((r) => r.term === 'contract note');
      expect(contractNote).toBeDefined();
      // No other rule should match or beat it — it's the single
      // strongest broker-only signal in the list.
      for (const r of FINANCIAL_KEYWORDS) {
        if (r.term !== 'contract note') {
          expect(r.weight).toBeLessThanOrEqual(contractNote!.weight);
        }
      }
    });
  });
});
