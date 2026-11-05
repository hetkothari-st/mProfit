import { Decimal } from 'decimal.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { sendEmail, type SendEmailInput } from '../notifications/email.service.js';
import { renderAdviceEmail, type PromptKind } from './adviceEmail.template.js';
import { complianceLine } from './compliance.js';

/**
 * Interruptions (spec §8–§9): a pop-up the next time the app opens, a bell
 * alert and an email. At most 2 a week per user (rolling 7 days, all kinds
 * together); advice with a hard deadline inside a week goes out regardless and
 * does not use up the 2.
 * Everything not sent waits in the Act on it page, which always shows it all.
 */

const DAY_MS = 86_400_000;
export const PROMPTS_PER_WEEK = 2;
export const NUDGE_AFTER_DAYS = 30;
/** New advice older than this is not announced any more (it is still on the page). */
const ANNOUNCE_WITHIN_DAYS = 14;

type Sender = (input: SendEmailInput) => Promise<unknown>;

interface Candidate {
  recommendationId: string;
  kind: PromptKind;
  urgent: boolean;
  weight: Decimal;
  headline: string;
  body: string;
}

const gainOf = (promise: unknown): Decimal => {
  const g = (promise as { gainInr?: unknown } | null)?.gainInr;
  return typeof g === 'string' ? new Decimal(g) : new Decimal(0);
};
const confidenceWeight = (promise: unknown) => ((promise as { confidence?: unknown } | null)?.confidence === 'MEDIUM' ? 0.7 : 1);
const firstSentence = (s: string) => (s.match(/^.*?[.!?](\s|$)/)?.[0] ?? s).trim();
const rupees = (d: Decimal) => `₹${d.abs().toDecimalPlaces(0).toNumber().toLocaleString('en-IN')}`;

async function candidates(userId: string, now: Date): Promise<Candidate[]> {
  const prompted = await prisma.advicePrompt.findMany({ where: { userId }, select: { recommendationId: true, kind: true } });
  const done = new Set(prompted.map((p) => `${p.recommendationId}|${p.kind}`));
  const recs = await prisma.advisorRecommendation.findMany({
    where: {
      userId,
      supersededById: null,
      OR: [
        { status: 'OPEN', createdAt: { gte: new Date(now.getTime() - ANNOUNCE_WITHIN_DAYS * DAY_MS) }, outcomeStatus: { not: 'BEFORE_TRACKING' } },
        { status: 'ACCEPTED', confirmedAt: null, nudgedAt: null, acceptedAt: { lte: new Date(now.getTime() - NUDGE_AFTER_DAYS * DAY_MS) } },
        { outcomeStatus: 'MEASURED', measuredAt: { gte: new Date(now.getTime() - ANNOUNCE_WITHIN_DAYS * DAY_MS) } },
      ],
    },
    select: { id: true, status: true, headline: true, rationale: true, promise: true, urgentUntil: true, outcomeStatus: true, outcomeInr: true },
  });
  const out: Candidate[] = [];
  for (const r of recs) {
    const headline = r.headline ?? 'New advice for you';
    const urgent = !!r.urgentUntil && r.urgentUntil >= now;
    if (r.outcomeStatus === 'MEASURED' && r.outcomeInr !== null) {
      if (done.has(`${r.id}|RESULT`)) continue;
      const v = new Decimal(r.outcomeInr.toString());
      const body = v.greaterThanOrEqualTo(0)
        ? `Acting on this earned ${rupees(v)} more than doing nothing.`
        : `Skipping this cost about ${rupees(v)} compared with acting on it.`;
      out.push({ recommendationId: r.id, kind: 'RESULT', urgent: false, weight: v.abs(), headline, body });
    } else if (r.status === 'ACCEPTED') {
      out.push({ recommendationId: r.id, kind: 'NUDGE', urgent: false, weight: gainOf(r.promise), headline, body: "You accepted this a month ago, but we haven't seen it in your accounts yet. If you did it somewhere we can't see, you can mark it done." });
    } else if (r.status === 'OPEN' && !done.has(`${r.id}|NEW`)) {
      out.push({ recommendationId: r.id, kind: 'NEW', urgent, weight: gainOf(r.promise).times(confidenceWeight(r.promise)), headline, body: firstSentence(r.rationale) });
    }
  }
  // Deadlines first, then the biggest rupee impact (weighted by confidence).
  return out.sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0) || b.weight.comparedTo(a.weight) || a.recommendationId.localeCompare(b.recommendationId));
}

/** Send what the weekly cap allows. Returns how many went out and how many wait. */
export async function queuePrompts(userId: string, now: Date = new Date(), opts: { send?: Sender } = {}): Promise<{ sent: number; held: number }> {
  const send = opts.send ?? sendEmail;
  // Urgent prompts bypass the cap and do not use it up.
  let thisWeek = await prisma.advicePrompt.count({ where: { userId, urgent: false, createdAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } } });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const line = await complianceLine();
  let sent = 0;
  let held = 0;
  for (const c of await candidates(userId, now)) {
    if (!c.urgent && thisWeek >= PROMPTS_PER_WEEK) {
      held += 1;
      continue;
    }
    const prompt = await prisma.advicePrompt.create({ data: { userId, recommendationId: c.recommendationId, kind: c.kind, urgent: c.urgent, createdAt: now } });
    if (c.kind === 'NUDGE') await prisma.advisorRecommendation.update({ where: { id: c.recommendationId }, data: { nudgedAt: now } });
    await prisma.alert.create({
      data: {
        userId, type: 'ADVICE', title: c.kind === 'NEW' ? `New advice: ${c.headline}` : c.kind === 'NUDGE' ? `Did you do it? ${c.headline}` : `Result is in: ${c.headline}`,
        description: c.body, triggerDate: now, metadata: { recommendationId: c.recommendationId, kind: c.kind, promptId: prompt.id },
      },
    });
    if (user?.email) {
      try {
        await send({ to: user.email, ...renderAdviceEmail({ kind: c.kind, headline: c.headline, body: c.body, appUrl: env.FRONTEND_URL, complianceLine: line }) });
        await prisma.advicePrompt.update({ where: { id: prompt.id }, data: { emailedAt: now } });
      } catch (err) {
        // The pop-up and the bell already carry it; email is best effort.
        logger.warn({ err: err instanceof Error ? err.message : String(err), promptId: prompt.id }, '[actOnIt] advice email failed');
      }
    }
    if (!c.urgent) thisWeek += 1;
    sent += 1;
  }
  return { sent, held };
}

export interface PopupView {
  promptId: string;
  recommendationId: string;
  kind: PromptKind;
  headline: string;
  gainInr: string | null;
  riskBand: string | null;
  liquidity: string | null;
  urgent: boolean;
}

/** The newest unseen pop-up for advice that is still open, or null. */
export async function pendingPopup(userId: string, now: Date = new Date()): Promise<PopupView | null> {
  const p = await prisma.advicePrompt.findFirst({
    where: { userId, popupSeenAt: null, kind: 'NEW', createdAt: { gte: new Date(now.getTime() - ANNOUNCE_WITHIN_DAYS * DAY_MS) }, recommendation: { status: 'OPEN' } },
    orderBy: [{ urgent: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, recommendationId: true, kind: true, urgent: true, recommendation: { select: { headline: true, promise: true } } },
  });
  if (!p) return null;
  const pr = (p.recommendation.promise ?? {}) as { gainInr?: string | null; riskBand?: string; liquidity?: string | null };
  return {
    promptId: p.id, recommendationId: p.recommendationId, kind: p.kind as PromptKind, headline: p.recommendation.headline ?? 'New advice for you',
    gainInr: pr.gainInr ?? null, riskBand: pr.riskBand ?? null, liquidity: pr.liquidity ?? null, urgent: p.urgent,
  };
}

export async function markPopupSeen(userId: string, promptId: string, now: Date = new Date()): Promise<void> {
  await prisma.advicePrompt.updateMany({ where: { id: promptId, userId }, data: { popupSeenAt: now } });
}
