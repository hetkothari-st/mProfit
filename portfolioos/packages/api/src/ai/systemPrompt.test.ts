import { describe, it, expect } from 'vitest';
import { AI_ASSISTANT_SYSTEM_PROMPT, COMPLIANCE_LINE } from './systemPrompt.js';
import { ADVISOR_PROSE_SYSTEM_PROMPT } from '../services/advisor/advisorSystemPrompt.js';

/**
 * The prompt is the product here, so the few lines that decide whether the
 * assistant advises or deflects are pinned. These are contract checks, not
 * style checks — a rewrite is free to change the wording around them.
 */
describe('assistant prompt — suitability', () => {
  it('profiles the client in the conversation instead of sending them to a form', () => {
    expect(AI_ASSISTANT_SYSTEM_PROMPT).toContain('WHEN THERE IS NO RISK PROFILE ON FILE');
    expect(AI_ASSISTANT_SYSTEM_PROMPT).toContain('save_risk_profile');
    expect(AI_ASSISTANT_SYSTEM_PROMPT).toMatch(/Do not send them away to fill in a form/i);
  });

  it('still refuses to invent the answers it profiles on', () => {
    expect(AI_ASSISTANT_SYSTEM_PROMPT).toMatch(/Never invent an answer/i);
    expect(AI_ASSISTANT_SYSTEM_PROMPT).toMatch(/never infer one from their portfolio/i);
  });

  it('keeps products to the approved list', () => {
    expect(AI_ASSISTANT_SYSTEM_PROMPT).toMatch(/ONLY names on the approved product list/);
  });
});

describe('assistant prompt — what it may and may not say', () => {
  it('keeps the forecasting and stock-tip bans', () => {
    expect(AI_ASSISTANT_SYSTEM_PROMPT).toMatch(/No forecasts/i);
    expect(AI_ASSISTANT_SYSTEM_PROMPT).toMatch(/No buy\/sell call on an individual stock/i);
    expect(AI_ASSISTANT_SYSTEM_PROMPT).toMatch(/no timing the market/i);
  });

  it('keeps the promises-of-returns and named-insurer bans', () => {
    expect(AI_ASSISTANT_SYSTEM_PROMPT).toMatch(/No promises of returns/i);
    expect(AI_ASSISTANT_SYSTEM_PROMPT).toMatch(/Never recommend an insurance product, plan or insurer by name/i);
  });

  // The complaint that started this: it declined things that are advice, not
  // prediction. Those are now named as expected answers.
  it('names the advice it must actually give', () => {
    for (const expected of [
      /Whether a position is too big/i,
      /Whether to hold, trim or exit/i,
      /What a market fall means for their plan/i,
      /belong in their plan at all/i,
    ]) {
      expect(AI_ASSISTANT_SYSTEM_PROMPT, String(expected)).toMatch(expected);
    }
  });

  it('requires the compliance line on recommendations', () => {
    expect(AI_ASSISTANT_SYSTEM_PROMPT).toContain(COMPLIANCE_LINE);
    expect(COMPLIANCE_LINE).toMatch(/market risks/i);
  });
});

describe('advisor prose prompt stays stricter', () => {
  // The /advisor surface has a deterministic engine and a consistency guard
  // behind it; loosening it to match the assistant would remove both.
  it('still forbids new numbers and new instruments', () => {
    expect(ADVISOR_PROSE_SYSTEM_PROMPT).toMatch(/Never introduce a number that is not present in the input/i);
    expect(ADVISOR_PROSE_SYSTEM_PROMPT).toMatch(/Never name an instrument, fund, scheme, stock, index or asset class/i);
  });

  it('has no profiling or product-recommendation powers', () => {
    expect(ADVISOR_PROSE_SYSTEM_PROMPT).not.toContain('save_risk_profile');
    expect(ADVISOR_PROSE_SYSTEM_PROMPT).toMatch(/Never add advice of your own/i);
  });
});
