import { Decimal, istCalendarDate, toAmount2 } from '@everypaisa/shared';
import { prisma } from '../../../../lib/prisma.js';
import { PLATE_SELECT, plateOf } from '../../../security/piiAtRest.service.js';
import { clip, SOLE, type EstateAdapter, type EstateCandidate } from '../types.js';
import {
  countedOwnedPropertyWhere,
  countedRentalPropertyWhere,
  ownedPropertyValue,
  rentalPropertyValue,
  sharePct2,
} from '../../../analytics/netWorthRules.js';

const ZERO = new Decimal(0);
const dec = (v: { toString(): string } | null | undefined): Decimal | null => (v == null ? null : new Decimal(v.toString()));

export const ownedPropertyAdapter: EstateAdapter = {
  id: 'ownedProperty',
  version: '1',
  async collect({ userId }) {
    const rows = await prisma.ownedProperty.findMany({
      where: countedOwnedPropertyWhere(userId),
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, city: true, ownershipType: true, ownershipPercent: true, currentValue: true, purchasePrice: true, currentValueAsOf: true },
    });
    return rows.map((p): EstateCandidate => {
      const value = ownedPropertyValue(p);
      const base = {
        sourceKey: `ownedProperty:${p.id}`, side: 'ASSET' as const, kind: 'OWNED_PROPERTY' as const,
        label: clip(p.city ? `${p.name}, ${p.city}` : p.name, 160), ref: null,
        value: toAmount2(value ?? ZERO), valueAsOf: p.currentValueAsOf ? istCalendarDate(p.currentValueAsOf) : null,
      };
      switch (p.ownershipType) {
        case 'COMPANY':
          return { ...base, ownership: SOLE, review: 'EXCLUDED', note: 'Owned by a company, so it is not yours to give. Your shares in the company are.' };
        case 'JOINT':
          return { ...base, ownership: { type: 'JOINT', sharePct: sharePct2(p.ownershipPercent) }, review: 'NEEDS_REVIEW', note: null };
        case 'HUF':
          return { ...base, ownership: { type: 'HUF', sharePct: sharePct2(p.ownershipPercent) }, review: 'NEEDS_REVIEW', note: null };
        default:
          return { ...base, ownership: SOLE, review: value ? 'CONFIRMED' : 'NEEDS_REVIEW', note: null };
      }
    });
  },
};

export const rentalPropertyAdapter: EstateAdapter = {
  id: 'rentalProperty',
  version: '1',
  async collect({ userId }) {
    const rows = await prisma.rentalProperty.findMany({
      where: await countedRentalPropertyWhere(userId),
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, currentValue: true, purchasePrice: true },
    });
    return rows.map((r): EstateCandidate => ({
      sourceKey: `rentalProperty:${r.id}`, side: 'ASSET', kind: 'RENTAL_PROPERTY', label: clip(r.name, 160), ref: null,
      value: toAmount2(rentalPropertyValue(r)), valueAsOf: null, ownership: SOLE,
      review: 'NEEDS_REVIEW', note: 'Ownership is not recorded for rental properties - check it.',
    }));
  },
};

export const vehiclesAdapter: EstateAdapter = {
  id: 'vehicles',
  version: '1',
  async collect({ userId }) {
    const rows = await prisma.vehicle.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, make: true, model: true, currentValue: true, ...PLATE_SELECT },
    });
    return rows.map((v): EstateCandidate => {
      const value = dec(v.currentValue);
      const plate = plateOf(v);
      return {
        sourceKey: `vehicle:${v.id}`, side: 'ASSET', kind: 'VEHICLE',
        label: clip([v.make, v.model].filter(Boolean).join(' ') || 'Vehicle', 160),
        ref: plate ? clip(plate, 40) : null,
        value: toAmount2(value ?? ZERO), valueAsOf: null, ownership: SOLE,
        review: value ? 'CONFIRMED' : 'NEEDS_REVIEW', note: null,
      };
    });
  },
};
