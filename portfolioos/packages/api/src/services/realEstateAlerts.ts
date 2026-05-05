/**
 * Real-estate alert generator. Produces three classes of alerts:
 *
 *  1. PROPERTY_TAX_DUE       — N days before propertyTaxDueMonth/01 each FY
 *  2. PROPERTY_POSSESSION_DUE — N days before expectedPossessionDate
 *  3. INSURANCE_PREMIUM       — N days before InsurancePolicy.nextPremiumDue
 *                                (only when property is linked to a policy)
 *
 * Idempotent via a `metadata.key` lookup, same shape as loan EMI alerts.
 * Run on a daily cron (registered alongside other alert scanners).
 */

import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

const ALERT_THRESHOLDS = [30, 15, 7, 1] as const;

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export async function generateRealEstateAlerts(userId?: string): Promise<number> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const properties = await prisma.ownedProperty.findMany({
    where: {
      ...(userId ? { userId } : {}),
      isActive: true,
      status: { not: 'SOLD' },
    },
    include: {
      insurancePolicy: { select: { id: true, insurer: true, nextPremiumDue: true } },
    },
  });

  let created = 0;

  for (const property of properties) {
    // Run each scan independently — a failure in one type of scan must not
    // prevent the others from running for the same property.
    for (const [name, fn] of [
      ['propertyTax', () => scanPropertyTax(property, today)],
      ['possession', () => scanPossession(property, today)],
      ['insuranceLink', () => scanInsuranceLink(property, today)],
    ] as const) {
      try {
        created += await fn();
      } catch (err) {
        logger.warn(
          { propertyId: property.id, scan: name, err },
          '[realEstateAlerts] scan failed — skipping',
        );
      }
    }
  }

  return created;
}

type PropertyForScan = Awaited<
  ReturnType<typeof prisma.ownedProperty.findMany>
>[number];

async function scanPropertyTax(property: PropertyForScan, today: Date): Promise<number> {
  if (!property.propertyTaxDueMonth) return 0;

  const dueMonth = property.propertyTaxDueMonth - 1; // JS 0-indexed
  const year = today.getUTCMonth() <= dueMonth ? today.getUTCFullYear() : today.getUTCFullYear() + 1;
  const dueDate = new Date(Date.UTC(year, dueMonth, 1));
  const days = daysBetween(today, dueDate);
  if (days < 0 || !ALERT_THRESHOLDS.includes(days as (typeof ALERT_THRESHOLDS)[number])) return 0;

  const metaKey = `property_tax:${property.id}:${dueDate.toISOString().slice(0, 10)}:${days}d`;
  const existing = await prisma.alert.findFirst({
    where: {
      userId: property.userId,
      type: 'PROPERTY_TAX_DUE',
      metadata: { path: ['key'], equals: metaKey },
    },
  });
  if (existing) return 0;

  const taxAmount = property.annualPropertyTax
    ? `₹${property.annualPropertyTax.toString()}`
    : '';
  await prisma.alert.create({
    data: {
      userId: property.userId,
      portfolioId: property.portfolioId,
      type: 'PROPERTY_TAX_DUE',
      title: `Property tax due in ${days} day${days !== 1 ? 's' : ''} — ${property.name}`,
      description: taxAmount
        ? `${taxAmount} property tax due on ${dueDate.toISOString().slice(0, 10)}`
        : `Property tax due on ${dueDate.toISOString().slice(0, 10)}`,
      triggerDate: new Date(),
      metadata: {
        key: metaKey,
        propertyId: property.id,
        propertyName: property.name,
        dueDate: dueDate.toISOString().slice(0, 10),
        daysLeft: days,
      },
    },
  });
  return 1;
}

async function scanPossession(property: PropertyForScan, today: Date): Promise<number> {
  if (!property.expectedPossessionDate) return 0;
  const due = new Date(property.expectedPossessionDate);
  const days = daysBetween(today, due);
  if (days < 0 || !ALERT_THRESHOLDS.includes(days as (typeof ALERT_THRESHOLDS)[number])) return 0;

  const metaKey = `property_possession:${property.id}:${due.toISOString().slice(0, 10)}:${days}d`;
  const existing = await prisma.alert.findFirst({
    where: {
      userId: property.userId,
      type: 'PROPERTY_POSSESSION_DUE',
      metadata: { path: ['key'], equals: metaKey },
    },
  });
  if (existing) return 0;

  await prisma.alert.create({
    data: {
      userId: property.userId,
      portfolioId: property.portfolioId,
      type: 'PROPERTY_POSSESSION_DUE',
      title: `Possession in ${days} day${days !== 1 ? 's' : ''} — ${property.name}`,
      description: property.builderName
        ? `${property.builderName} — possession expected on ${due.toISOString().slice(0, 10)}`
        : `Possession expected on ${due.toISOString().slice(0, 10)}`,
      triggerDate: new Date(),
      metadata: {
        key: metaKey,
        propertyId: property.id,
        propertyName: property.name,
        dueDate: due.toISOString().slice(0, 10),
        daysLeft: days,
      },
    },
  });
  return 1;
}

async function scanInsuranceLink(
  property: PropertyForScan & {
    insurancePolicy: { id: string; insurer: string; nextPremiumDue: Date | null } | null;
  },
  today: Date,
): Promise<number> {
  const policy = property.insurancePolicy;
  if (!policy?.nextPremiumDue) return 0;
  const days = daysBetween(today, new Date(policy.nextPremiumDue));
  if (days < 0 || !ALERT_THRESHOLDS.includes(days as (typeof ALERT_THRESHOLDS)[number])) return 0;

  const metaKey = `property_insurance:${property.id}:${policy.id}:${policy.nextPremiumDue.toISOString().slice(0, 10)}:${days}d`;
  const existing = await prisma.alert.findFirst({
    where: {
      userId: property.userId,
      type: 'INSURANCE_PREMIUM',
      metadata: { path: ['key'], equals: metaKey },
    },
  });
  if (existing) return 0;

  await prisma.alert.create({
    data: {
      userId: property.userId,
      portfolioId: property.portfolioId,
      type: 'INSURANCE_PREMIUM',
      title: `Insurance renewal in ${days} day${days !== 1 ? 's' : ''} — ${property.name}`,
      description: `${policy.insurer} — premium due on ${policy.nextPremiumDue.toISOString().slice(0, 10)}`,
      triggerDate: new Date(),
      metadata: {
        key: metaKey,
        propertyId: property.id,
        policyId: policy.id,
        dueDate: policy.nextPremiumDue.toISOString().slice(0, 10),
        daysLeft: days,
      },
    },
  });
  return 1;
}
