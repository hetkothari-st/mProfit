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

export interface SuggestedQuestion {
  question: string;
  intent: string;
}

const ALWAYS_ON: SuggestedQuestion[] = [
  { question: 'How am I doing overall?', intent: 'portfolio_health' },
  { question: "What's my portfolio XIRR?", intent: 'xirr_query' },
];

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
  // Fill remaining slots from ALWAYS_ON.
  for (const q of ALWAYS_ON) {
    if (out.length >= 4) break;
    if (!out.some((x) => x.intent === q.intent)) out.push(q);
  }
  return out.slice(0, 4);
}

void prisma;
