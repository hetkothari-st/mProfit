/**
 * AI Assistant — contextually relevant suggested questions.
 *
 * Called by the frontend on load + after every assistant response.
 * Pulls a small set of high-signal cues from the user's live data
 * (LTCG headroom, goal status, high-value holdings) and returns 4
 * ranked question suggestions the user can tap to send.
 */

import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { getAnalyticsSnapshot } from '../services/analytics.service.js';
import { listGoals } from '../services/goals.service.js';
import { listPolicies } from '../services/insurance.service.js';

export interface SuggestedQuestion {
  question: string;
  intent: string;
}

const ALWAYS_ON: SuggestedQuestion[] = [
  { question: 'How am I doing overall?', intent: 'portfolio_health' },
  { question: "What's my portfolio XIRR?", intent: 'xirr_query' },
];

/** Insurance questions the assistant answers from the user's policies and the Help and rights library. */
export const INSURANCE_EXAMPLE_QUESTIONS: SuggestedQuestion[] = [
  { question: 'Which of my policies have no nominee?', intent: 'insurance' },
  { question: 'What happens if I miss a premium?', intent: 'insurance' },
  { question: 'Where does my insurance claim stand?', intent: 'insurance' },
  { question: 'How do I complain if my claim is rejected?', intent: 'insurance' },
  { question: 'Can I move my health policy to another insurer?', intent: 'insurance' },
];

const NOMINEE_EXPECTED = new Set(['TERM', 'WHOLE_LIFE', 'ULIP', 'ENDOWMENT', 'HEALTH', 'PERSONAL_ACCIDENT']);

/**
 * The one insurance question most worth asking now, if any: a premium past
 * its due date first (urgent), then a claim waiting on the user, then a
 * policy with no nominee, else a general example for anyone with policies.
 */
async function insuranceCue(userId: string): Promise<{ q: SuggestedQuestion; urgent: boolean } | null> {
  const policies = await listPolicies(userId);
  const active = policies.filter((p) => p.status === 'ACTIVE');
  if (active.length === 0) return null;

  const overdue = active.find((p) => p.premiumDue.state === 'IN_GRACE' || p.premiumDue.state === 'LAPSE_RISK');
  if (overdue) {
    return {
      q: { question: `My ${overdue.insurer} premium is overdue — what happens now?`, intent: 'insurance' },
      urgent: true,
    };
  }
  const claimPolicy = policies.find((p) =>
    p.claims.some((c) => c.progress.next.action === 'FILE_GRIEVANCE' || c.progress.next.action === 'GO_TO_OMBUDSMAN'),
  );
  if (claimPolicy) {
    return {
      q: { question: `What should I do next on my ${claimPolicy.insurer} insurance claim?`, intent: 'insurance' },
      urgent: true,
    };
  }
  const noNominee = active.some(
    (p) => NOMINEE_EXPECTED.has(p.type) && !(Array.isArray(p.nominees) && p.nominees.length > 0),
  );
  if (noNominee) return { q: INSURANCE_EXAMPLE_QUESTIONS[0]!, urgent: false };
  return { q: INSURANCE_EXAMPLE_QUESTIONS[1]!, urgent: false };
}

export async function computeSuggestedQuestions(
  userId: string,
): Promise<SuggestedQuestion[]> {
  const out: SuggestedQuestion[] = [];
  try {
    const snap = await getAnalyticsSnapshot({ kind: 'user', userId }, '1Y');
    const ltcg = Number(snap.taxHarvest.realisedLtcgInFy ?? 0);
    // Close to the ₹1.25 lakh exemption? Nudge.
    if (ltcg > 90_000 && ltcg < 125_000) {
      out.push({
        question: 'Am I close to my LTCG exemption limit?',
        intent: 'tax_drag',
      });
    }
    // Big top holding? Suggest concentration check.
    const top = snap.concentrationRisk?.[0];
    if (top && top.pct > 20) {
      out.push({
        question: `Am I too concentrated in ${top.assetName}?`,
        intent: 'allocation_check',
      });
    }
    // Sector concentration.
    const topSector = snap.sectorAllocation?.[0];
    if (topSector && topSector.pct > 25) {
      out.push({
        question: `Am I overweight in ${topSector.sector}?`,
        intent: 'allocation_check',
      });
    }
  } catch (err) {
    logger.warn({ err }, '[ai.suggested] snapshot fetch failed');
  }
  try {
    const goals = (await listGoals(userId)) as Array<Record<string, unknown>>;
    const behind = goals.find((g) => g.onTrack === false || g.status === 'behind');
    if (behind) {
      out.push({
        question: `Am I on track for ${behind.name as string}?`,
        intent: 'goal_projection',
      });
    }
  } catch (err) {
    logger.warn({ err }, '[ai.suggested] goals fetch failed');
  }
  try {
    const cue = await insuranceCue(userId);
    if (cue?.urgent) out.unshift(cue.q);
    else if (cue) out.push(cue.q);
  } catch (err) {
    logger.warn({ err }, '[ai.suggested] insurance fetch failed');
  }
  // Fill remaining slots from ALWAYS_ON.
  for (const q of ALWAYS_ON) {
    if (out.length >= 4) break;
    if (!out.some((x) => x.intent === q.intent)) out.push(q);
  }
  return out.slice(0, 4);
}

void prisma;
