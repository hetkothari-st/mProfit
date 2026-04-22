/**
 * §7.5 Challan service.
 *
 * Orchestrates the challan adapter, persists new rows (unique by
 * `(vehicleId, challanNo)` per §4.6 schema), emits one
 * `VEHICLE_CHALLAN` CanonicalEvent per new challan so the user can
 * review challans in the same queue as everything else, and writes a
 * DLQ row on adapter failure.
 *
 * Caller surfaces:
 *
 *   - `scanChallansForVehicle(userId, vehicleId)` — user-triggered via
 *     the "Check challans" button on `/vehicles/:id`. Returns the full
 *     before/after diff so the UI can show "3 new, 2 updated, 5
 *     unchanged."
 *   - `scanChallansMonthlyForAllActiveVehicles()` — cron path (§7.6).
 *     Same mechanics, no user context; it runs under the system RLS
 *     bypass like the other scheduled jobs.
 */

import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  ForbiddenError,
  NotFoundError,
} from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { runAsSystem } from '../lib/requestContext.js';
import {
  fetchChallansForRegNo,
  type ChallanFetchResult,
  type ChallanRow,
  CHALLAN_ADAPTER_ID,
  CHALLAN_ADAPTER_VERSION,
} from '../adapters/vehicle/challan.js';
import { writeIngestionFailure } from './ingestionFailures.service.js';

// The $extends-wrapped Prisma client passes a different tx client type
// to $transaction callbacks than Prisma.TransactionClient — extract it
// structurally (same trick as canonicalEvents.service.ts).
type ExtendedTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export interface ChallanScanOutcome {
  ok: boolean;
  source: string;
  sourceVersion: string;
  newChallans: number;
  updatedChallans: number;
  unchangedChallans: number;
  totalReturned: number;
  error?: string;
}

function challanSourceHash(
  userId: string,
  vehicleId: string,
  challanNo: string,
): string {
  return createHash('sha256')
    .update(`challan:${userId}:${vehicleId}:${challanNo}`)
    .digest('hex');
}

/**
 * Upsert one adapter-fetched challan row. Returns whether the row was
 * new, updated (amount/status changed), or unchanged — the service
 * uses this to tally the scan outcome and decide whether to emit a
 * CanonicalEvent (new only).
 */
async function upsertChallan(
  tx: ExtendedTx,
  vehicleId: string,
  row: ChallanRow,
): Promise<'new' | 'updated' | 'unchanged'> {
  const existing = await tx.challan.findUnique({
    where: { vehicleId_challanNo: { vehicleId, challanNo: row.challanNo } },
  });
  const data = {
    offenceDate: new Date(`${row.offenceDate}T00:00:00.000Z`),
    offenceType: row.offenceType ?? null,
    location: row.location ?? null,
    amount: new Prisma.Decimal(row.amount),
    status: row.status,
    details: (row.details ?? {}) as Prisma.InputJsonValue,
    fetchedAt: new Date(),
  };
  if (!existing) {
    await tx.challan.create({
      data: { vehicleId, challanNo: row.challanNo, ...data },
    });
    return 'new';
  }
  const amountChanged = !existing.amount.equals(data.amount);
  const statusChanged = existing.status !== data.status;
  if (!amountChanged && !statusChanged) {
    await tx.challan.update({
      where: { id: existing.id },
      data: { fetchedAt: data.fetchedAt },
    });
    return 'unchanged';
  }
  await tx.challan.update({
    where: { id: existing.id },
    data: {
      amount: data.amount,
      status: data.status,
      details: data.details,
      fetchedAt: data.fetchedAt,
    },
  });
  return 'updated';
}

async function emitCanonicalEvent(
  tx: ExtendedTx,
  userId: string,
  vehicleId: string,
  regNo: string,
  row: ChallanRow,
): Promise<void> {
  const hash = challanSourceHash(userId, vehicleId, row.challanNo);
  const eventDate = new Date(`${row.offenceDate}T00:00:00.000Z`);
  await tx.canonicalEvent.upsert({
    where: { userId_sourceHash: { userId, sourceHash: hash } },
    create: {
      userId,
      sourceAdapter: CHALLAN_ADAPTER_ID,
      sourceAdapterVer: CHALLAN_ADAPTER_VERSION,
      sourceRef: `${regNo}:${row.challanNo}`,
      sourceHash: hash,
      eventType: 'VEHICLE_CHALLAN',
      eventDate,
      amount: new Prisma.Decimal(row.amount),
      counterparty: row.location ?? null,
      metadata: {
        vehicleId,
        registrationNo: regNo,
        challanNo: row.challanNo,
        offenceType: row.offenceType,
        location: row.location,
        status: row.status,
      } as Prisma.InputJsonValue,
      confidence: new Prisma.Decimal('1.00'),
      status: 'PENDING_REVIEW',
    },
    update: {},
  });
}

async function applyScanOutcomeToDb(
  userId: string,
  vehicleId: string,
  regNo: string,
  result: ChallanFetchResult,
): Promise<ChallanScanOutcome> {
  let fresh = 0;
  let updated = 0;
  let unchanged = 0;
  for (const row of result.challans) {
    const action = await prisma.$transaction(async (tx) => {
      const status = await upsertChallan(tx, vehicleId, row);
      if (status === 'new') {
        await emitCanonicalEvent(tx, userId, vehicleId, regNo, row);
      }
      return status;
    });
    if (action === 'new') fresh += 1;
    else if (action === 'updated') updated += 1;
    else unchanged += 1;
  }

  return {
    ok: result.ok,
    source: result.source,
    sourceVersion: result.sourceVersion,
    newChallans: fresh,
    updatedChallans: updated,
    unchangedChallans: unchanged,
    totalReturned: result.challans.length,
    error: result.error,
  };
}

export async function scanChallansForVehicle(
  userId: string,
  vehicleId: string,
): Promise<ChallanScanOutcome> {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: {
      id: true,
      userId: true,
      registrationNo: true,
      chassisLast4: true,
    },
  });
  if (!vehicle) throw new NotFoundError('Vehicle not found');
  if (vehicle.userId !== userId) throw new ForbiddenError();

  const result = await fetchChallansForRegNo(
    vehicle.registrationNo,
    vehicle.chassisLast4,
  );
  if (!result.ok) {
    await writeIngestionFailure({
      userId,
      sourceAdapter: CHALLAN_ADAPTER_ID,
      adapterVersion: CHALLAN_ADAPTER_VERSION,
      sourceRef: vehicle.registrationNo,
      error: result.error ?? 'Challan adapter returned not-ok without an error',
      rawPayload: { vehicleId, result },
    });
    return {
      ok: false,
      source: result.source,
      sourceVersion: result.sourceVersion,
      newChallans: 0,
      updatedChallans: 0,
      unchangedChallans: 0,
      totalReturned: 0,
      error: result.error,
    };
  }

  return applyScanOutcomeToDb(
    userId,
    vehicleId,
    vehicle.registrationNo,
    result,
  );
}

/**
 * Cron path (§7.6). Iterates every user-owned vehicle; scheduler wraps
 * in `runAsSystem` so RLS lets us see them. Failures per-vehicle don't
 * stop the batch — each one writes its own DLQ row.
 */
export async function scanChallansMonthlyForAllActiveVehicles(): Promise<{
  vehiclesScanned: number;
  totalNew: number;
  totalUpdated: number;
  totalFailed: number;
}> {
  return runAsSystem(async () => {
    const vehicles = await prisma.vehicle.findMany({
      select: {
        id: true,
        userId: true,
        registrationNo: true,
        chassisLast4: true,
      },
    });
    let totalNew = 0;
    let totalUpdated = 0;
    let totalFailed = 0;
    for (const v of vehicles) {
      try {
        const outcome = await scanChallansForVehicle(v.userId, v.id);
        if (outcome.ok) {
          totalNew += outcome.newChallans;
          totalUpdated += outcome.updatedChallans;
        } else {
          totalFailed += 1;
        }
      } catch (err) {
        totalFailed += 1;
        logger.warn(
          { err, vehicleId: v.id, regNo: v.registrationNo },
          '[challan.cron] per-vehicle scan threw',
        );
      }
    }
    return {
      vehiclesScanned: vehicles.length,
      totalNew,
      totalUpdated,
      totalFailed,
    };
  });
}
