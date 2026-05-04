/**
 * Vehicle adapter framework — §7.1.
 *
 * A vehicle adapter resolves a registration number (RC) into a structured
 * {@link VehicleRecord}. Multiple adapters form a chain (§7.1) — we try the
 * fastest/freest source first (mParivahan reverse-engineered API), fall
 * through to a Playwright portal flow that requires OTP, and finally to a
 * user-pasted SMS as the guaranteed fallback.
 *
 * Shape decisions:
 *
 * - Every adapter declares `{id, version}` so `Vehicle.refreshSource` and
 *   future audit logs carry lineage matching §3.4 (no silent format
 *   rewrites).
 * - Adapters return a discriminated {@link VehicleFetchResult}. Chain
 *   callers never throw — they pick the first `ok: true` result, or
 *   aggregate the per-adapter errors into an IngestionFailure (§3.5).
 * - Any adapter may declare `supportsAuto: false` to signal that it needs
 *   user interaction (OTP, SMS paste). The scheduler (§7.6) only auto-
 *   polls `supportsAuto: true` adapters; interactive ones run on the
 *   "Refresh now" button.
 */

export interface VehicleRecord {
  /** Normalised RC, upper-cased, whitespace-stripped. */
  registrationNo: string;
  make?: string;
  model?: string;
  variant?: string;
  manufacturingYear?: number;
  fuelType?: string;
  color?: string;
  chassisLast4?: string;
  rtoCode?: string;
  ownerName?: string;
  insuranceExpiry?: string; // ISO YYYY-MM-DD
  pucExpiry?: string;
  fitnessExpiry?: string;
  roadTaxExpiry?: string;
  permitExpiry?: string;
  // ── Promoted from metadata so service layer can write to first-class columns ──
  rcStatus?: string;
  vehicleClass?: string;
  normsType?: string;
  seatingCapacity?: number;
  unloadedWeight?: number;
  engineNo?: string;
  hypothecation?: string;
  registrationDate?: string; // ISO YYYY-MM-DD
  /** Adapter-specific extras (raw API response, evidence). */
  metadata?: Record<string, unknown>;
}

export type VehicleFetchResult =
  | { ok: true; record: VehicleRecord; warnings?: string[] }
  | { ok: false; error: string; retryable?: boolean; rawPayload?: unknown };

export interface VehicleAdapterContext {
  userId: string;
  /** Chassis last 4 — required by some adapters (parivahan portal). */
  chassisLast4?: string;
  /**
   * For SMS adapter — the verbatim VAHAN SMS reply the user pasted.
   * Irrelevant to remote adapters; they ignore it.
   */
  smsBody?: string;
}

export interface VehicleAdapter {
  id: string;
  version: string;
  /** Human-readable short name for chain errors and the UI. */
  displayName: string;
  /**
   * Can this adapter fetch without live user interaction (OTP/CAPTCHA)?
   * The weekly auto-refresh cron (§7.6) skips interactive adapters.
   */
  supportsAuto: boolean;
  fetch(regNo: string, ctx: VehicleAdapterContext): Promise<VehicleFetchResult>;
}

/**
 * Aggregate shape the service layer returns to callers. Carries every
 * per-adapter attempt so the UI can show "mParivahan failed: API_CHANGED;
 * portal timed out; SMS adapter needs input" when all options are exhausted.
 */
export interface VehicleChainOutcome {
  ok: boolean;
  /** The winning record, if any. */
  record?: VehicleRecord;
  /** Which adapter produced the record. */
  source?: string;
  /** Version of the winning adapter. */
  sourceVersion?: string;
  attempts: Array<{
    adapter: string;
    version: string;
    ok: boolean;
    error?: string;
  }>;
}
