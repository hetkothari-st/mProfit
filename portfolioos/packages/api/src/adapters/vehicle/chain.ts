/**
 * §7.1 Vehicle adapter chain.
 *
 * Tries adapters in priority order. First `ok: true` wins. On a full
 * strikeout, writes one IngestionFailure row (§3.5) carrying the full
 * attempt log so /imports/failures surfaces the situation.
 *
 * Modes:
 *
 *   - `auto` (scheduler, weekly refresh): skip adapters with
 *     `supportsAuto: false` so we never silently ask for an OTP the
 *     user can't see.
 *   - `interactive` (explicit "Refresh now" button or SMS paste): run
 *     everything in order.
 */

import { writeIngestionFailure } from '../../services/ingestionFailures.service.js';
import { logger } from '../../lib/logger.js';
import { smsVehicleAdapter } from './sms.js';
import { mparivahanAdapter } from './mparivahan.js';
import { parivahanPortalAdapter } from './portal.js';
import { apimallRcAdapter } from './apimall.js';
import type {
  VehicleAdapter,
  VehicleAdapterContext,
  VehicleChainOutcome,
} from './types.js';

export type VehicleFetchMode = 'auto' | 'interactive';

/**
 * Default chain order per §7.1.
 * APIMall commercial API is tried after mParivahan (free) and before the
 * interactive portal — it is auto-capable and needs only APIMALL_API_KEY.
 * The adapter self-disables (retryable:false, descriptive error) when the
 * key is not set, so the chain degrades gracefully without it.
 */
const DEFAULT_CHAIN: VehicleAdapter[] = [
  mparivahanAdapter,   // free, government endpoint (may fail outside mobile IPs)
  apimallRcAdapter,    // commercial, reliable — needs APIMALL_API_KEY
  parivahanPortalAdapter, // interactive OTP, user must be present
  smsVehicleAdapter,   // human-in-the-loop final fallback
];

export interface RunVehicleChainInput {
  userId: string;
  registrationNo: string;
  mode: VehicleFetchMode;
  context: Omit<VehicleAdapterContext, 'userId'>;
  /** Override chain for tests / per-vehicle custom preferences. */
  adapters?: VehicleAdapter[];
}

export async function runVehicleChain(
  input: RunVehicleChainInput,
): Promise<VehicleChainOutcome> {
  const chain = input.adapters ?? DEFAULT_CHAIN;
  const outcome: VehicleChainOutcome = { ok: false, attempts: [] };

  for (const adapter of chain) {
    if (input.mode === 'auto' && !adapter.supportsAuto) {
      outcome.attempts.push({
        adapter: adapter.id,
        version: adapter.version,
        ok: false,
        error: 'skipped (interactive adapter, auto mode)',
      });
      continue;
    }

    try {
      const result = await adapter.fetch(input.registrationNo, {
        userId: input.userId,
        ...input.context,
      });
      if (result.ok) {
        outcome.ok = true;
        outcome.record = result.record;
        outcome.source = adapter.id;
        outcome.sourceVersion = adapter.version;
        outcome.attempts.push({
          adapter: adapter.id,
          version: adapter.version,
          ok: true,
        });
        return outcome;
      }
      outcome.attempts.push({
        adapter: adapter.id,
        version: adapter.version,
        ok: false,
        error: result.error,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        { err: message, adapter: adapter.id, regNo: input.registrationNo },
        '[vehicle.chain] adapter threw — continuing to next',
      );
      outcome.attempts.push({
        adapter: adapter.id,
        version: adapter.version,
        ok: false,
        error: message,
      });
    }
  }

  // Full strike-out — write DLQ unless every adapter was a skip (auto
  // mode with no candidates; that's not really a failure worth surfacing).
  const realAttempts = outcome.attempts.filter(
    (a) => !a.error?.startsWith('skipped'),
  );
  if (realAttempts.length > 0) {
    await writeIngestionFailure({
      userId: input.userId,
      sourceAdapter: 'vehicle.chain',
      adapterVersion: '1',
      sourceRef: input.registrationNo,
      error: `All ${realAttempts.length} vehicle adapter(s) failed for ${input.registrationNo}`,
      rawPayload: { attempts: outcome.attempts, mode: input.mode },
    });
  }

  return outcome;
}
