import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';
import type { AlertType, AssetClass } from '@prisma/client';
import { generateLoanEmiAlerts } from './loans.service.js';
import { generateCreditCardAlerts } from './creditCards.service.js';
import { generateRealEstateAlerts } from './realEstateAlerts.js';

const EXPIRY_THRESHOLDS = [30, 15, 7, 1] as const;

// ─── Read / CRUD ──────────────────────────────────────────────────────────────

export async function listAlerts(
  userId: string,
  params?: { unreadOnly?: boolean; type?: AlertType; limit?: number; page?: number },
) {
  const page = params?.page ?? 1;
  const limit = Math.min(params?.limit ?? 50, 200);
  const skip = (page - 1) * limit;

  const where = {
    userId,
    isActive: true,
    ...(params?.unreadOnly ? { isRead: false } : {}),
    ...(params?.type ? { type: params.type } : {}),
  };

  const [alerts, total, unreadCount] = await Promise.all([
    prisma.alert.findMany({
      where,
      orderBy: [{ isRead: 'asc' }, { triggerDate: 'desc' }],
      skip,
      take: limit,
    }),
    prisma.alert.count({ where }),
    prisma.alert.count({ where: { userId, isActive: true, isRead: false } }),
  ]);

  return {
    alerts: alerts.map(formatAlert),
    total,
    unreadCount,
    page,
    limit,
  };
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.alert.count({ where: { userId, isActive: true, isRead: false } });
}

export async function markRead(userId: string, alertId: string) {
  const alert = await prisma.alert.findFirst({ where: { id: alertId, userId } });
  if (!alert) throw new NotFoundError(`Alert ${alertId} not found`);
  return prisma.alert.update({ where: { id: alertId }, data: { isRead: true } });
}

export async function markAllRead(userId: string) {
  const { count } = await prisma.alert.updateMany({
    where: { userId, isRead: false, isActive: true },
    data: { isRead: true },
  });
  return count;
}

export async function deleteAlert(userId: string, alertId: string) {
  const alert = await prisma.alert.findFirst({ where: { id: alertId, userId } });
  if (!alert) throw new NotFoundError(`Alert ${alertId} not found`);
  await prisma.alert.update({ where: { id: alertId }, data: { isActive: false } });
}

export async function createCustomAlert(
  userId: string,
  data: { title: string; description?: string; triggerDate: string; portfolioId?: string },
) {
  return prisma.alert.create({
    data: {
      userId,
      type: 'CUSTOM',
      title: data.title,
      description: data.description ?? null,
      triggerDate: new Date(data.triggerDate),
      portfolioId: data.portfolioId ?? null,
    },
  });
}

function formatAlert(a: {
  id: string; type: AlertType; title: string; description: string | null;
  triggerDate: Date; isRead: boolean; isActive: boolean; metadata: unknown; createdAt: Date;
}) {
  return {
    id: a.id,
    type: a.type,
    title: a.title,
    description: a.description,
    triggerDate: a.triggerDate.toISOString().slice(0, 10),
    isRead: a.isRead,
    metadata: a.metadata,
    createdAt: a.createdAt,
  };
}

// ─── Vehicle expiry scanner ───────────────────────────────────────────────────

type VehicleExpiryField = 'pucExpiry' | 'insuranceExpiry' | 'fitnessExpiry' | 'roadTaxExpiry';

const VEHICLE_EXPIRY_FIELDS: Array<{ field: VehicleExpiryField; label: string }> = [
  { field: 'pucExpiry', label: 'PUC' },
  { field: 'insuranceExpiry', label: 'Insurance' },
  { field: 'fitnessExpiry', label: 'Fitness Certificate' },
  { field: 'roadTaxExpiry', label: 'Road Tax' },
];

export async function generateVehicleExpiryAlerts(userId?: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + 30);

  const vehicles = await prisma.vehicle.findMany({
    where: {
      ...(userId ? { userId } : {}),
      OR: VEHICLE_EXPIRY_FIELDS.map(({ field }) => ({
        [field]: { gte: today, lte: cutoff },
      })),
    },
    select: {
      id: true, userId: true, registrationNo: true,
      pucExpiry: true, insuranceExpiry: true, fitnessExpiry: true, roadTaxExpiry: true,
    },
  });

  let created = 0;
  for (const vehicle of vehicles) {
    for (const { field, label } of VEHICLE_EXPIRY_FIELDS) {
      const expiryDate = vehicle[field] as Date | null;
      if (!expiryDate) continue;

      const daysLeft = Math.ceil(
        (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (!(EXPIRY_THRESHOLDS as readonly number[]).includes(daysLeft)) continue;

      const metaKey = `vehicle_expiry:${vehicle.id}:${field}:${daysLeft}d`;
      const existing = await prisma.alert.findFirst({
        where: { userId: vehicle.userId, type: 'CUSTOM', metadata: { path: ['key'], equals: metaKey } },
      });
      if (existing) continue;

      await prisma.alert.create({
        data: {
          userId: vehicle.userId,
          type: 'CUSTOM',
          title: `${label} expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
          description: `Vehicle ${vehicle.registrationNo} — ${label} expires on ${expiryDate.toISOString().slice(0, 10)}`,
          triggerDate: new Date(),
          metadata: { key: metaKey, vehicleId: vehicle.id, field, daysLeft },
        },
      });
      created++;
    }
  }
  return created;
}

// ─── Rent overdue scanner ─────────────────────────────────────────────────────

export async function generateRentOverdueAlerts(userId?: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdueThreshold = new Date(today);
  overdueThreshold.setDate(overdueThreshold.getDate() - 7);

  const overdue = await prisma.rentReceipt.findMany({
    where: {
      status: 'OVERDUE',
      tenancy: { property: { ...(userId ? { userId } : {}) } },
      dueDate: { lte: overdueThreshold },
    },
    include: {
      tenancy: {
        include: {
          property: { select: { userId: true, name: true } },
        },
      },
    },
  });

  let created = 0;
  for (const receipt of overdue) {
    const ownerId = receipt.tenancy.property.userId;
    const metaKey = `rent_overdue:${receipt.id}`;
    const existing = await prisma.alert.findFirst({
      where: { userId: ownerId, type: 'CUSTOM', metadata: { path: ['key'], equals: metaKey } },
    });
    if (existing) continue;

    await prisma.alert.create({
      data: {
        userId: ownerId,
        type: 'CUSTOM',
        title: `Rent overdue — ${receipt.tenancy.property.name}`,
        description: `${receipt.forMonth} rent of ₹${receipt.expectedAmount} is overdue`,
        triggerDate: new Date(),
        metadata: { key: metaKey, receiptId: receipt.id, forMonth: receipt.forMonth },
      },
    });
    created++;
  }
  return created;
}

// ─── Post Office maturity scanner ────────────────────────────────────────────

const PO_MATURITY_CLASSES: AssetClass[] = [
  'NSC', 'KVP', 'SCSS', 'SSY', 'POST_OFFICE_MIS', 'POST_OFFICE_RD', 'POST_OFFICE_TD',
];

const PO_LABELS: Record<string, string> = {
  NSC: 'NSC',
  KVP: 'KVP',
  SCSS: 'SCSS',
  SSY: 'SSY',
  POST_OFFICE_MIS: 'Post Office MIS',
  POST_OFFICE_RD: 'Post Office RD',
  POST_OFFICE_TD: 'Post Office TD',
};

export async function generatePoMaturityAlerts(userId?: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + 30);

  const txns = await prisma.transaction.findMany({
    where: {
      portfolio: userId ? { userId } : undefined,
      assetClass: { in: PO_MATURITY_CLASSES },
      transactionType: { in: ['BUY', 'DEPOSIT', 'OPENING_BALANCE'] },
      maturityDate: { gte: today, lte: cutoff },
    },
    select: {
      id: true,
      assetClass: true,
      assetName: true,
      maturityDate: true,
      netAmount: true,
      portfolioId: true,
    },
  });

  // Bulk-resolve portfolioId → userId to avoid N+1 queries
  const portfolioIds = [...new Set(txns.map((t) => t.portfolioId))];
  const portfolios = await prisma.portfolio.findMany({
    where: { id: { in: portfolioIds } },
    select: { id: true, userId: true },
  });
  const portfolioUserMap = new Map(portfolios.map((p) => [p.id, p.userId]));

  let created = 0;
  for (const txn of txns) {
    const ownerId = portfolioUserMap.get(txn.portfolioId);
    if (!ownerId) continue;
    const expiryDate = txn.maturityDate as Date;
    const daysLeft = Math.ceil(
      (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (!(EXPIRY_THRESHOLDS as readonly number[]).includes(daysLeft)) continue;

    const schemeLabel = PO_LABELS[txn.assetClass] ?? txn.assetClass;
    const metaKey = `po_maturity:${txn.id}:${daysLeft}d`;
    const existing = await prisma.alert.findFirst({
      where: {
        userId: ownerId,
        type: 'FD_MATURITY',
        metadata: { path: ['key'], equals: metaKey },
      },
    });
    if (existing) continue;

    await prisma.alert.create({
      data: {
        userId: ownerId,
        type: 'FD_MATURITY',
        title: `${schemeLabel} matures in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
        description: `${txn.assetName ?? schemeLabel} matures on ${expiryDate.toISOString().slice(0, 10)}`,
        triggerDate: new Date(),
        metadata: { key: metaKey, transactionId: txn.id, daysLeft },
      },
    });
    created++;
  }
  return created;
}

// ─── Master scanner (runs all sub-scanners) ───────────────────────────────────

export async function runAllAlertScans(userId?: string): Promise<{
  vehicle: number;
  rent: number;
  poMaturity: number;
  loan: number;
  creditCard: number;
  realEstate: number;
}> {
  const [vehicle, rent, poMaturity, loan, creditCard, realEstate] = await Promise.all([
    generateVehicleExpiryAlerts(userId),
    generateRentOverdueAlerts(userId),
    generatePoMaturityAlerts(userId),
    generateLoanEmiAlerts(userId),
    generateCreditCardAlerts(userId),
    generateRealEstateAlerts(userId),
  ]);
  return { vehicle, rent, poMaturity, loan, creditCard, realEstate };
}
