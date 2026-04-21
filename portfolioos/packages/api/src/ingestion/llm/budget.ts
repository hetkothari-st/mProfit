import { Decimal } from '@portfolioos/shared';
import { prisma } from '../../lib/prisma.js';

/**
 * §9 / §17 LLM budget service.
 *
 * Default thresholds live in `AppSetting`:
 *   - `llm.monthly_warn_inr` (₹500) — flag for the user but keep parsing
 *   - `llm.monthly_cap_inr`  (₹1000) — stop parsing, archive the email
 *
 * Per-user overrides live under keyed variants `llm.monthly_cap_inr.user.${userId}`;
 * if absent, the global default applies. Both are Json-typed in the DB so
 * future richer policies (per-feature caps, gradual rollout) don't need a
 * schema change.
 *
 * A budget check is done BEFORE the call so we don't incur spend we're
 * not going to use. A spend record is written AFTER, inside the same
 * request flow, so the next budget check sees the updated total.
 */

export const DEFAULT_WARN_INR = new Decimal('500');
export const DEFAULT_CAP_INR = new Decimal('1000');

/** First day of this month in UTC — aggregate boundary for the monthly sum. */
export function monthStartUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function readSettingDecimal(
  key: string,
  fallback: Decimal,
): Promise<Decimal> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  if (!row) return fallback;
  // AppSetting.value is Json — accept number, string, or bare-decimal
  // shapes so seed scripts can write any of them without breaking reads.
  const v = row.value;
  if (typeof v === 'number' || typeof v === 'string') return new Decimal(v);
  return fallback;
}

/** Both thresholds resolved (user override if present, else global). */
export async function getBudgetLimits(userId: string): Promise<{
  warnInr: Decimal;
  capInr: Decimal;
}> {
  const [warn, cap] = await Promise.all([
    readSettingDecimal(
      `llm.monthly_warn_inr.user.${userId}`,
      await readSettingDecimal('llm.monthly_warn_inr', DEFAULT_WARN_INR),
    ),
    readSettingDecimal(
      `llm.monthly_cap_inr.user.${userId}`,
      await readSettingDecimal('llm.monthly_cap_inr', DEFAULT_CAP_INR),
    ),
  ]);
  return { warnInr: warn, capInr: cap };
}

/**
 * Sum of costInr for this user's LlmSpend rows since the start of the
 * current UTC month. Includes failed calls — a flaky upstream that
 * charges per-attempt still counts.
 */
export async function getMonthToDateSpend(userId: string): Promise<Decimal> {
  const since = monthStartUtc();
  const rows = await prisma.llmSpend.findMany({
    where: { userId, createdAt: { gte: since } },
    select: { costInr: true },
  });
  return rows.reduce(
    (acc, r) => acc.plus(new Decimal(r.costInr.toString())),
    new Decimal(0),
  );
}

export type BudgetStatus =
  | { status: 'ok'; spent: Decimal; warn: Decimal; cap: Decimal }
  | { status: 'warn'; spent: Decimal; warn: Decimal; cap: Decimal }
  | { status: 'capped'; spent: Decimal; warn: Decimal; cap: Decimal };

/**
 * Pre-call budget check. Callers must treat 'capped' as a stop signal and
 * route the email to `CanonicalEvent.status = ARCHIVED` per §6.1 /
 * §6.11 exit criterion "Budget enforcement: set cap to ₹1 → next LLM
 * call refuses, event goes to ARCHIVED".
 */
export async function checkBudget(userId: string): Promise<BudgetStatus> {
  const [{ warnInr, capInr }, spent] = await Promise.all([
    getBudgetLimits(userId),
    getMonthToDateSpend(userId),
  ]);
  if (spent.gte(capInr)) return { status: 'capped', spent, warn: warnInr, cap: capInr };
  if (spent.gte(warnInr)) return { status: 'warn', spent, warn: warnInr, cap: capInr };
  return { status: 'ok', spent, warn: warnInr, cap: capInr };
}

/**
 * Cost model for Claude Haiku 4.5 (as of 2026-04). Published pricing is
 * USD/MTok; we convert at a conservative FX default (₹90/USD) so the
 * cap can never be undercharged due to FX tracking lag. Override with
 * `llm.usd_inr_fx` AppSetting if ops wants to tighten this.
 *
 * Unit tests lock the numbers so a price drift or model rename blocks CI
 * rather than silently over/under-charging users.
 */
export const HAIKU_USD_PER_MTOK_INPUT = new Decimal('1.00');
export const HAIKU_USD_PER_MTOK_OUTPUT = new Decimal('5.00');
export const FX_USD_INR_DEFAULT = new Decimal('90');

export async function estimateCostInr(opts: {
  inputTokens: number;
  outputTokens: number;
}): Promise<Decimal> {
  const fx = await readSettingDecimal('llm.usd_inr_fx', FX_USD_INR_DEFAULT);
  const usd = HAIKU_USD_PER_MTOK_INPUT.mul(opts.inputTokens)
    .plus(HAIKU_USD_PER_MTOK_OUTPUT.mul(opts.outputTokens))
    .div(1_000_000);
  // Four fractional INR digits — matches the LlmSpend.costInr column scale.
  return usd.mul(fx);
}
