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

  // Fund names now come from the ranking methodology through one tool. The
  // rule that matters is unchanged in spirit: the model may not name a fund
  // nobody authorised, whether from an approved list or from its own memory.
  it('allows only funds the engine returned this turn', () => {
    expect(AI_ASSISTANT_SYSTEM_PROMPT).toMatch(/ONLY schemes returned by get_recommended_funds/);
    expect(AI_ASSISTANT_SYSTEM_PROMPT).toMatch(/Never name a fund from your own knowledge/i);
  });

  it('requires the direct plan to be stated, and the disclosure at the end', () => {
    expect(AI_ASSISTANT_SYSTEM_PROMPT).toMatch(/direct plan, growth option/i);
    expect(AI_ASSISTANT_SYSTEM_PROMPT).toMatch(/SEBI registration number/i);
  });

  it('names nothing when the tool reports a fallback', () => {
    expect(AI_ASSISTANT_SYSTEM_PROMPT).toMatch(/fallback:true, name nothing/i);
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

// Each of these was a real failure in a production answer: a from-zero SIP
// quoted to a client who already had a portfolio, a ₹28 lakh crypto trim
// recommended with no mention of 30% tax, and a goal card reading ₹0.
describe('assistant prompt — the three rigour rules', () => {
  it('forbids quoting a SIP that ignores the existing corpus', () => {
    expect(AI_ASSISTANT_SYSTEM_PROMPT).toMatch(/NEVER quote a required SIP as if the client started from nothing/i);
    expect(AI_ASSISTANT_SYSTEM_PROMPT).toContain('sipIfStartingFromZero');
  });

  it('requires the tax on any sale it recommends', () => {
    expect(AI_ASSISTANT_SYSTEM_PROMPT).toMatch(/NEVER recommend a sale without its tax/i);
    expect(AI_ASSISTANT_SYSTEM_PROMPT).toMatch(/Crypto is 30% flat/i);
  });

  it('forbids a placeholder zero in a data card', () => {
    expect(AI_ASSISTANT_SYSTEM_PROMPT).toMatch(/NEVER put a number you do not have into a data card/i);
  });

  it('requires one basis when quoting a position twice', () => {
    expect(AI_ASSISTANT_SYSTEM_PROMPT).toMatch(/One figure, one basis/i);
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
