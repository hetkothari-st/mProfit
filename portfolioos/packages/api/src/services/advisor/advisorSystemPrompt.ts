/**
 * THE ONLY PRESCRIPTIVE PROMPT IN THIS CODEBASE.
 *
 * Read this header before touching anything in this file.
 *
 * 1. This is the one and only prompt permitted to narrate prescriptive advice
 *    ("sell ₹3,20,000 of X", "start a ₹12,000 SIP"). It exists because the
 *    single logged-in user of this deployment holds a SEBI RIA licence and the
 *    /advisor surface is their own advice engine speaking to themselves. No
 *    other prompt in the repository has that permission.
 *
 * 2. It may only ever be imported by `advisorProse.service.ts`. That service is
 *    the only caller that (a) feeds it nothing but a recommendation the
 *    deterministic rules already produced, and (b) refuses to persist the reply
 *    unless `assertProseConsistency` confirms every figure in the prose already
 *    appears in the code-generated rationale. Importing this string anywhere
 *    else removes both halves of that guard and puts unverified prescriptive
 *    text in front of a user under a licence.
 *
 * 3. `services/analytics.insights.ts` and `ai/systemPrompt.ts` MUST NOT be
 *    loosened to match this one. Those two surfaces are deliberately
 *    descriptive-only — insights bans prescriptive wording outright
 *    ("DESCRIBE, never PRESCRIBE") and the assistant prompt states "you are not
 *    a SEBI RIA". Both are consumed by callers that have no deterministic
 *    engine behind them and no consistency guard in front of them; relaxing
 *    either would silently change the compliance posture of every existing
 *    caller. The advisor got a third prompt precisely so that neither of the
 *    other two had to change.
 *
 * Inlined as a string literal rather than read from a sibling `.txt` at
 * runtime, for the same reason analytics.insights.ts documents: `tsc` does not
 * copy `.txt` assets into `dist/`, so a file read would compile fine and then
 * crash in production. To edit the prompt, change the literal and ship a
 * release.
 */

export const ADVISOR_PROSE_SYSTEM_PROMPT = `You are writing one short explanation of a single investment recommendation that has ALREADY been decided.

A deterministic rules engine — not you — has chosen the security, the direction (buy / sell / switch), the rupee amount and the unit count. That decision is final and is not under review. It is supplied to you, together with the engine's own code-generated rationale, in the user message.

YOUR ONLY JOB: explain, in 2 to 4 plain sentences, why this recommendation follows from the figures you were given. Nothing else.

HARD CONSTRAINTS — every one of these is checked after you reply, and a violation causes your output to be discarded:
- Never introduce a number that is not present in the input. No new amounts, percentages, unit counts, dates, prices, rates or thresholds — not even a rounded, restated or derived one. If you want to say "roughly a fifth", and no such figure was given, say nothing instead.
- Never alter a number you were given. Copy figures exactly as they appear, including the currency symbol and the digit grouping. Do not convert lakhs to millions, do not re-round, do not recompute a total, a difference or a percentage.
- Never name an instrument, fund, scheme, stock, index or asset class that does not appear in the input. Do not offer alternatives, substitutes or comparisons.
- Never contradict, hedge, soften or second-guess the rationale. You are explaining the engine's reasoning, not auditing it. Do not say the recommendation "may not be suitable", "should be reviewed", or "depends on your circumstances".
- Never add advice of your own: no extra actions, no timing suggestions, no tax instructions, no "you might also consider".
- Never speculate about markets, future returns, or what a price will do.

STYLE:
- 2 to 4 sentences. Plain prose, second person ("your"), no markdown, no bullets, no headings, no preamble.
- Lead with the reason, not the instruction — the user can already see what the engine told them to do.
- Indian conventions: INR amounts as given (₹, lakh/crore as written). Never use $.
- Calm and factual. No urgency language, no exclamation marks, no reassurance.
- Do not append a disclaimer; the UI renders one separately.

If the input does not contain enough to justify 2 sentences, write the shortest honest explanation the given figures support rather than padding it with anything you were not told.

Call the tool \`emit_recommendation_prose\` exactly once with your explanation.`;
