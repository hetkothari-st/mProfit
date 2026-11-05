import cron from 'node-cron';
import { hasFeature, type PlanTierValue } from '@everypaisa/shared';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { runAsSystem, runAsUser } from '../lib/requestContext.js';
import { effectivePlan } from '../lib/effectivePlan.js';
import { runAdvisorEngine } from '../services/advisor/advisorEngine.service.js';
import { expireDue } from '../services/actOnIt/lifecycle.js';
import { confirmFromData } from '../services/actOnIt/confirm.js';
import { measureDue } from '../services/actOnIt/measure.js';
import { queuePrompts } from '../services/actOnIt/prompts.js';
import { updateRuleHealth } from '../services/actOnIt/ruleHealth.js';
import type { SendEmailInput } from '../services/notifications/email.service.js';

/**
 * Act on it, every night at 05:30 IST (spec §6): for each user whose plan
 * includes advice — run the advice engine, expire undecided advice, look for
 * advised moves in their data, price results that are due, and send what the
 * weekly prompt cap allows. Then, across users, pause advice types that keep
 * missing their own estimates. One user's failure is logged; the rest run.
 * ENABLE_ACT_ON_IT_JOB=false disables it.
 */

const TZ = 'Asia/Kolkata';
let running = false;

export interface ActOnItJobResult {
  users: number;
  failed: number;
  prompts: number;
  confirmed: number;
  measured: number;
}

async function eligibleUsers(now: Date, only?: string[]): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: only ? { id: { in: only } } : { OR: [{ advisorRuns: { some: {} } }, { portfolios: { some: { holdingProjections: { some: {} } } } }] },
    select: { id: true, plan: true, planExpiresAt: true },
  });
  return users.filter((u) => hasFeature(effectivePlan(u, now) as PlanTierValue, 'ADVICE_ENGINE')).map((u) => u.id);
}

export async function runActOnItJob(
  now: Date = new Date(),
  opts: { userIds?: string[]; send?: (input: SendEmailInput) => Promise<unknown> } = {},
): Promise<ActOnItJobResult | null> {
  if (running) {
    logger.warn('[cron] act on it already running — skipping');
    return null;
  }
  running = true;
  const out: ActOnItJobResult = { users: 0, failed: 0, prompts: 0, confirmed: 0, measured: 0 };
  try {
    const ids = await runAsSystem(() => eligibleUsers(now, opts.userIds));
    for (const userId of ids) {
      try {
        await runAsUser(userId, async () => {
          // Moves first: advice acted on straight from its card stops firing, and
          // must be credited before the engine would withdraw it.
          out.confirmed += await confirmFromData(userId, now);
          await runAdvisorEngine(userId, { triggeredBy: 'SYSTEM', asOf: now });
          await expireDue(userId, now);
          out.confirmed += await confirmFromData(userId, now);
          out.measured += await measureDue(userId, now);
          out.prompts += (await queuePrompts(userId, now, opts.send ? { send: opts.send } : {})).sent;
        });
      } catch (err) {
        out.failed += 1;
        logger.error({ err, userId }, '[cron] act on it failed for user');
      }
    }
    out.users = ids.length;
    await runAsSystem(() => updateRuleHealth(now));
    logger.info(out, '[cron] act on it done');
    return out;
  } finally {
    running = false;
  }
}

/** NOT self-registering: called from index.ts. */
export function startActOnItJob(): void {
  if (process.env.ENABLE_ACT_ON_IT_JOB === 'false') {
    logger.info('[cron] act on it disabled via ENABLE_ACT_ON_IT_JOB=false');
    return;
  }
  cron.schedule('30 5 * * *', () => void runActOnItJob().catch((err) => logger.error({ err }, '[cron] act on it failed')), { timezone: TZ });
  logger.info('[cron] scheduled: act on it @05:30 IST daily');
}
