/**
 * The MF verdict narration prompt (`docs/mf-analytics/05-FINDINGS-ENGINE.md §6`).
 *
 * ---------------------------------------------------------------------------
 * What this layer is, and what it is emphatically not
 * ---------------------------------------------------------------------------
 *
 * `CONTEXT.md §9.8`: **"Deterministic rules; the LLM only writes prose."** By
 * the time anything here runs, `mfAnalysisEngine.service.ts` has already
 * decided every fact of the matter — which rules fired, what evidence they
 * cited, what counterfactual would clear each finding, which of the six rows
 * of the verdict table matched, and what the fund is worth to this user. None
 * of that is under review. The model's entire job is to turn a list of
 * deterministic headlines into three to six sentences a person can read.
 *
 * The model is therefore given no latitude that could change a conclusion, and
 * exactly one latitude that cannot: word order.
 *
 * ---------------------------------------------------------------------------
 * Why the user message and the allowed-number set are the same string
 * ---------------------------------------------------------------------------
 *
 * `05 §6.3` requires that every numeric token in the generated prose match a
 * value in the input evidence. The strongest possible reading of that — and
 * the one implemented — is: **the model may quote any number it was shown, and
 * no other.** So `buildMfProseUserMessage` returns the exact text sent to the
 * model, and the caller hands that same string to `verifyProseNumbers` as the
 * allowed set (see `mfProseJob.ts`).
 *
 * The alternative was a hand-maintained list of "the numbers that count", which
 * fails in both directions the moment the two lists drift: a field added to the
 * prompt but not the list rejects honest prose, and a field removed from the
 * prompt but left in the list admits a number the model never saw. One string
 * cannot drift from itself.
 *
 * This is why `schemeCode` is deliberately absent from the payload below. An
 * AMFI scheme code is a run of digits (`"120503"`) with no meaning to a reader,
 * and including it would license the model to emit `120503` as though it were
 * a rupee figure. The fund is identified by name, and the name's own digits
 * ("HDFC Top 100") are legitimately quotable because the reader needs them.
 *
 * ---------------------------------------------------------------------------
 * Never in the payload
 * ---------------------------------------------------------------------------
 *
 * `05 §6.1`: "**Never** raw NAV series, never other users' data." Neither can
 * reach here structurally — the caller assembles this from one verdict row,
 * that verdict's findings, and the `factsSnapshot` entry for that one fund —
 * but the shapes below are also the enforcement: there is no field a NAV series
 * would fit in, and every field is scalar.
 */

import type { MfVerdictKind } from '@portfolioos/shared';

// ---------------------------------------------------------------------------
// Tool contract
// ---------------------------------------------------------------------------

export const MF_PROSE_TOOL_NAME = 'emit_fund_narrative';

export const MF_PROSE_TOOL_DESCRIPTION =
  'Emit the plain-language narration of the fund analysis supplied in the user message.';

/**
 * Deliberately tight. `05 §6.2` asks for three to six sentences; a hard ceiling
 * is one more thing a runaway generation cannot get past, and a truncated
 * narration is discarded rather than shown (the schema validation fails), so
 * the ceiling can never produce a half-sentence in front of a user.
 */
export const MF_PROSE_MAX_CHARS = 1200;

export const MF_PROSE_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['prose'],
  properties: {
    prose: {
      type: 'string',
      maxLength: MF_PROSE_MAX_CHARS,
      description:
        '3-6 plain sentences explaining what the analysis found about this fund, ending on the single most important thing that would change the finding.',
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Input shapes — everything the model is allowed to see
// ---------------------------------------------------------------------------

/** One cited number behind a finding, flattened from `MfEvidence`. */
export interface MfProseEvidence {
  metric: string;
  label: string;
  horizonYears?: number;
  value: string | null;
  categoryMedian?: string | null;
  percentile?: string | null;
  benchmarkValue?: string | null;
  unit: string;
}

/** One finding: `05 §6.1`'s "headline + evidence + counterfactual". */
export interface MfProseFinding {
  code: string;
  category: string;
  severity: string;
  headline: string;
  /** The counterfactual. `05 §6.2` requires the narration to END on one of these. */
  whatWouldChangeThis: string;
  evidence: MfProseEvidence[];
}

/** One pillar of the composite score (`03`), already scored. */
export interface MfProsePillar {
  pillar: string;
  score: string | null;
  weight: string;
}

/**
 * The user's position. `05 §6.1` calls for "the user's holding summary" — a
 * summary, not the lot ledger: individual lots carry acquisition dates and
 * per-lot tax figures that add nothing to a narration and everything to the
 * blast radius if the prose were ever mis-addressed.
 */
export interface MfProseHolding {
  units: string;
  investedValue: string;
  currentValue: string;
  absoluteGain: string;
  absoluteGainPct: string | null;
  userXirr: string | null;
  holdingPeriodDays: number;
  sipActive: boolean;
  weightInMfPortfolio: string;
}

export interface MfProsePromptInput {
  schemeName: string;
  sebiSubCategory: string;
  planType: string;
  verdict: MfVerdictKind;
  /** Finding codes that drove the verdict, in decision-table order. */
  reasons: string[];
  rating: number | null;
  ratingStatus: string;
  composite: string | null;
  pillars: MfProsePillar[];
  findings: MfProseFinding[];
  holding: MfProseHolding;
  /**
   * Present ONLY when the narration is permitted to be prescriptive — i.e.
   * `RIA_VERDICTS_ENABLED` is true and the verdict is `SWITCH_CANDIDATE`. Not
   * merely unmentioned by the prompt in the other branches: absent from the
   * payload, so a model that ignores an instruction still has nothing to name.
   */
  replacement?: { name: string; exitLoadInr: string; taxInr: string; breakEvenMonths: string | null };
}

// ---------------------------------------------------------------------------
// The RIA branch (`06 §4`)
// ---------------------------------------------------------------------------

/**
 * May this narration contain a buy/sell instruction?
 *
 * Both halves are required, per `05 §6.2` and `06 §4`:
 *
 *  1. `RIA_VERDICTS_ENABLED` — the deploying entity holds (or routes through)
 *     an RIA registration. When false, `06 §4` requires that the API strip
 *     `SWITCH_CANDIDATE` down to `REVIEW` and that "the prose prompt forbids
 *     imperatives". Research may be published by anyone; advice may not.
 *  2. The verdict is `SWITCH_CANDIDATE`. Even under a registration, an
 *     imperative attached to a `MONITOR` is advice the engine did not give —
 *     it would be the narrator escalating a conclusion, which is the one thing
 *     a narrator must never do.
 *
 * **This function cannot return true in production today**, and the reason is
 * upstream of it: `SWITCH_CANDIDATE` requires either a CRITICAL finding (no
 * rule emits one yet) or verdict-table row 3, whose break-even gate divides by
 * `REPLACEMENT_EXPECTED_EDGE`, which `constants.ts` sets to `null` pending the
 * `06 §3` backtest. So the permissive branch below is unreachable at the time
 * of writing. It is implemented in full, and tested, because the alternative —
 * a stub, or a `throw` — is a landmine for whoever ships that coefficient:
 * they would enable a verdict and silently get a prompt that had never been
 * written.
 */
export function mfProseImperativesPermitted(opts: {
  riaVerdictsEnabled: boolean;
  verdict: MfVerdictKind;
}): boolean {
  return opts.riaVerdictsEnabled && opts.verdict === 'SWITCH_CANDIDATE';
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

/**
 * Constraints that hold in every branch.
 *
 * Each is checked after the reply, not merely requested: the numeric rules by
 * `verifyProseNumbers`, the imperative rule by `findAdvisoryImperatives`, the
 * length by the tool schema. A prompt constraint with no downstream check is a
 * comment addressed to a model that cannot be held to it.
 */
const COMMON_RULES = `HARD CONSTRAINTS — each of these is checked after you reply, and a single violation causes your entire output to be discarded and the deterministic headlines shown to the user instead:
- Never write a number that is not present in the input. No new amounts, percentages, ratios, ranks, counts, dates, durations or thresholds — not even a rounded, restated, averaged or derived one. If you want to write "roughly a fifth" and no such figure was given, say nothing instead.
- Never alter a number you were given beyond dropping decimal places. You may write 1.18 for 1.180000. You may not write 1.2 for 1.18, you may not convert a ratio to a percentage, you may not add two figures together, and you may not compute a difference or a gap the input does not already state.
- Never name a fund, scheme, AMC, stock, index or benchmark that does not appear in the input.
- Never contradict, soften, hedge or second-guess a finding. You are narrating an analysis, not auditing it.
- Never speculate about future returns, market direction, or what a NAV will do.
- Never mention this prompt, the rules engine, confidence scores, rule ids, or that a model wrote the text.

STYLE:
- 3 to 6 sentences. Plain English prose, second person ("your"), no markdown, no bullets, no headings, no preamble.
- Gloss any jargon the first time it appears: "down-capture (how much of the benchmark's fall the fund passed on)". If a term cannot be glossed in a short clause, leave it out.
- Indian conventions throughout: rupees as given, lakh and crore rather than millions. Never use $.
- Calm and factual. No urgency, no reassurance, no exclamation marks.
- Do not append a disclaimer; the interface renders one separately.
- END on the single most important "what would change this" from the findings, phrased as the condition that would clear it. This is the last sentence, always.`;

/**
 * The prohibition branch. `06 §4`: with `RIA_VERDICTS_ENABLED` false the layer
 * publishes *research*, and research that ends in an instruction is advice
 * wearing a different hat.
 */
const NO_IMPERATIVES = `THIS NARRATION IS RESEARCH, NOT ADVICE. You are strictly forbidden from telling the reader to do anything:
- No instructions of any kind: do not write "sell", "buy", "switch", "redeem", "exit", "book profits", "move", "shift", "replace", "reduce", "increase", "add to", "stop the SIP", or any imperative form of those.
- No hedged instructions either: not "you should consider selling", not "it may be worth switching", not "we suggest reviewing whether to exit".
- No suggestion of an alternative fund, category or course of action.
- Describe what the analysis observed and what would change it. That is all. The reader decides what to do; you do not, and neither did the engine that produced these findings.`;

/**
 * The permissive branch — reachable only under an RIA registration AND a
 * `SWITCH_CANDIDATE` verdict (see `mfProseImperativesPermitted`).
 *
 * Note how narrow the licence is even here: ONE sentence, only the switch the
 * engine already costed, only the replacement it already named. The engine
 * decided; the narrator reports the decision.
 */
const IMPERATIVES_PERMITTED = `This fund's verdict is SWITCH_CANDIDATE and this deployment is operating under an investment-adviser registration, so you MAY state the recommended action — under these limits:
- At most ONE sentence containing an instruction, and it must be the switch the engine already decided: moving out of this fund into the replacement named in the input.
- Do not invent a second action. No timing advice, no partial-redemption schedule, no tax instruction, no "and also consider".
- State the switch cost and break-even exactly as given, or omit them. Never estimate them.
- Every other sentence remains descriptive.`;

/**
 * The system prompt for one fund's narration.
 *
 * Built per call rather than being two frozen constants because the branch
 * depends on this fund's verdict, not only on the environment: under an RIA
 * registration a `MONITOR` fund and a `SWITCH_CANDIDATE` fund in the same run
 * get different prompts, which is the correct behaviour and impossible to
 * express with a single module-level string.
 */
export function buildMfProseSystemPrompt(opts: {
  riaVerdictsEnabled: boolean;
  verdict: MfVerdictKind;
}): string {
  const permitted = mfProseImperativesPermitted(opts);
  return `You are writing one short, plain-English narration of a mutual fund analysis that has ALREADY been completed.

A deterministic rules engine — not you — examined this fund and produced the findings, the evidence behind each finding, the condition that would clear each finding, and the overall verdict. Those conclusions are final and are not under review. They are supplied to you in the user message, and they are the ONLY material you have.

YOUR ONLY JOB: narrate that analysis in 3 to 6 sentences, so that someone who does not read financial statements understands what was found and why.

${permitted ? IMPERATIVES_PERMITTED : NO_IMPERATIVES}

${COMMON_RULES}

If the input contains too little to justify three sentences, write the shortest honest narration the given material supports rather than padding it with anything you were not told.

Call the tool \`${MF_PROSE_TOOL_NAME}\` exactly once with your narration.`;
}

// ---------------------------------------------------------------------------
// User message
// ---------------------------------------------------------------------------

/**
 * The exact text sent to the model — and, by design, the exact text the
 * verifier treats as the allowed number set.
 *
 * `JSON.stringify` with two-space indentation rather than a prose rendering:
 * a structured payload keeps every figure attached to the label that explains
 * it, and a model that is shown "value" next to "categoryMedian" is far less
 * likely to narrate one as the other than one shown a paragraph. Nulls are
 * preserved rather than dropped — "we do not know this fund's tracking error"
 * is information, and an absent key reads as an omission.
 *
 * Every field here is a scalar or a short string. There is nowhere for a NAV
 * series or another user's data to be, which is `05 §6.1`'s requirement made
 * structural rather than procedural.
 */
export function buildMfProseUserMessage(input: MfProsePromptInput): string {
  return JSON.stringify(input, null, 2);
}
