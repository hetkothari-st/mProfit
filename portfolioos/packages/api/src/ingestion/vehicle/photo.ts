/**
 * Stock-photo lookup by (make, model).
 *
 * Indian RC system does not publish per-vehicle photos. This module returns
 * a stock image keyed off make+model from `VehiclePhotoSeed` (seeded once
 * from CarDekho catalog scrape). Falls back to a generic body-type image
 * when no specific match.
 *
 * Returns null only when neither make nor model is known on the input
 * vehicle — UI then shows no photo at all rather than a fake one.
 */

import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';

export interface PhotoResolution {
  url: string;
  source: string; // "carDekho" | "stock-generic" | "user-upload"
}

const GENERIC_BY_BODY_TYPE: Record<string, string> = {
  sedan:     '/assets/vehicle-generic-sedan.svg',
  suv:       '/assets/vehicle-generic-suv.svg',
  hatchback: '/assets/vehicle-generic-hatchback.svg',
  mpv:       '/assets/vehicle-generic-suv.svg',
  muv:       '/assets/vehicle-generic-suv.svg',
  bike:      '/assets/vehicle-generic-bike.svg',
  scooter:   '/assets/vehicle-generic-scooter.svg',
  motorcycle:'/assets/vehicle-generic-bike.svg',
};

function inferBodyType(vehicleClass?: string | null): string | null {
  const vc = (vehicleClass ?? '').toUpperCase();
  if (vc.includes('CYCLE') || vc.includes('MOTORCYCLE') || vc.includes('M-CYCLE')) return 'bike';
  if (vc.includes('SCOOTER') || vc.includes('MOPED')) return 'scooter';
  if (vc.includes('SUV') || vc.includes('UTILITY')) return 'suv';
  if (vc.includes('SEDAN') || vc.includes('LMV-SEDAN')) return 'sedan';
  if (vc.includes('HATCH')) return 'hatchback';
  if (vc.includes('MPV') || vc.includes('MUV')) return 'mpv';
  if (vc.includes('LMV')) return 'sedan';
  return null;
}

export async function resolveVehiclePhoto(
  make: string | null | undefined,
  model: string | null | undefined,
  vehicleClass?: string | null,
  _fuelType?: string | null,
): Promise<PhotoResolution | null> {
  const m = (make ?? '').trim();
  const md = (model ?? '').trim();

  if (m && md) {
    try {
      // Case-insensitive lookup
      const seed = await prisma.vehiclePhotoSeed.findFirst({
        where: {
          make: { equals: m, mode: 'insensitive' },
          model: { equals: md, mode: 'insensitive' },
        },
        orderBy: { updatedAt: 'desc' },
      });
      if (seed) {
        return { url: seed.photoUrl, source: seed.sourceAttribution };
      }
    } catch (err) {
      logger.warn({ err, make: m, model: md }, '[photo] seed lookup failed');
    }
  }

  // Generic body-type fallback
  const bodyType = inferBodyType(vehicleClass);
  if (bodyType && GENERIC_BY_BODY_TYPE[bodyType]) {
    return { url: GENERIC_BY_BODY_TYPE[bodyType]!, source: 'stock-generic' };
  }

  return null;
}
