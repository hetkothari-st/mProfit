/**
 * Map pins for properties (Real Estate and Rentals).
 *
 * A pin is looked up from the property's address once, via OpenStreetMap
 * Nominatim (lib/nominatim), and stored with the address it came from — so an
 * unchanged address is never sent again, even when nothing was found. A pin
 * the user places by hand ("manual") is kept until they reset it. When only a
 * broader part of the address matches (the area rather than the building),
 * the pin is marked "approximate".
 */

import { prisma } from '../lib/prisma.js';
import { BadRequestError, NotFoundError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { searchPlace, type Place } from '../lib/nominatim.js';
import type { PropertyRef, PropertyOwnerType } from './propertyPhotos.service.js';

export type LocationSource = 'geocoded' | 'approximate' | 'manual';

export interface PropertyLocation {
  latitude: number | null;
  longitude: number | null;
  source: LocationSource | null;
}

interface LocatedRow {
  id: string;
  address: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  country?: string | null;
  latitude: number | null;
  longitude: number | null;
  locationSource: string | null;
  geocodedAddress: string | null;
}

interface LocationWrite {
  latitude: number | null;
  longitude: number | null;
  locationSource: string | null;
  geocodedAddress?: string | null;
  geocodedAt: Date | null;
}

const LOCATION_SELECT = {
  latitude: true,
  longitude: true,
  locationSource: true,
  geocodedAddress: true,
} as const;

const MAX_CANDIDATES = 4;
/** New addresses looked up per list request; the rest follow on the next one. */
const LIST_LOOKUP_BUDGET = 3;

/**
 * The queries to try for an address: in full, then dropping leading parts
 * ("Flat 12, …") one at a time, down to the last two parts.
 */
export function addressCandidates(address: string): string[] {
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return [];
  if (parts.length <= 2) return [parts.join(', ')];
  const out: string[] = [];
  for (let i = 0; parts.length - i >= 2 && out.length < MAX_CANDIDATES; i++) {
    out.push(parts.slice(i).join(', '));
  }
  return out;
}

function fullAddress(ref: PropertyRef, row: LocatedRow): string {
  if (ref.type === 'RENTAL_PROPERTY') return row.address?.trim() ?? '';
  const country = row.country === 'IN' ? 'India' : row.country;
  return [row.address, row.city, row.state, row.pincode, country]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(', ');
}

function countryCode(ref: PropertyRef, row: LocatedRow): string | undefined {
  if (ref.type === 'RENTAL_PROPERTY') return 'in';
  return row.country && /^[A-Za-z]{2}$/.test(row.country) ? row.country.toLowerCase() : undefined;
}

const toLocation = (row: Pick<LocatedRow, 'latitude' | 'longitude' | 'locationSource'>): PropertyLocation => ({
  latitude: row.latitude,
  longitude: row.longitude,
  source: (row.locationSource as LocationSource | null) ?? null,
});

async function load(userId: string, ref: PropertyRef): Promise<LocatedRow> {
  const row =
    ref.type === 'OWNED_PROPERTY'
      ? await prisma.ownedProperty.findFirst({
          where: { id: ref.id, userId },
          select: { id: true, address: true, city: true, state: true, pincode: true, country: true, ...LOCATION_SELECT },
        })
      : await prisma.rentalProperty.findFirst({
          where: { id: ref.id, userId },
          select: { id: true, address: true, ...LOCATION_SELECT },
        });
  if (!row) throw new NotFoundError('Property not found');
  return row;
}

async function save(ref: PropertyRef, data: LocationWrite): Promise<void> {
  if (ref.type === 'OWNED_PROPERTY') {
    await prisma.ownedProperty.update({ where: { id: ref.id }, data });
  } else {
    await prisma.rentalProperty.update({ where: { id: ref.id }, data });
  }
}

async function locateRow(ref: PropertyRef, row: LocatedRow): Promise<PropertyLocation> {
  if (row.locationSource === 'manual' && row.latitude !== null) return toLocation(row);
  const address = fullAddress(ref, row);
  if (!address) return toLocation(row);
  if (row.geocodedAddress === address) return toLocation(row);

  let hit: Place | null = null;
  let matchedIndex = -1;
  try {
    for (const [i, query] of addressCandidates(address).entries()) {
      hit = await searchPlace(query, countryCode(ref, row));
      if (hit) {
        matchedIndex = i;
        break;
      }
    }
  } catch (err) {
    // Nothing recorded, so the address is tried again on the next view.
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), propertyId: ref.id },
      '[property-location] address lookup failed; will retry later',
    );
    return toLocation(row);
  }

  const data: LocationWrite = hit
    ? {
        latitude: hit.lat,
        longitude: hit.lon,
        locationSource: matchedIndex === 0 ? 'geocoded' : 'approximate',
        geocodedAddress: address,
        geocodedAt: new Date(),
      }
    : { latitude: null, longitude: null, locationSource: null, geocodedAddress: address, geocodedAt: new Date() };
  await save(ref, data);
  return toLocation(data);
}

/** The property's pin, looking its address up if it hasn't been yet. */
export async function locateProperty(userId: string, ref: PropertyRef): Promise<PropertyLocation> {
  return locateRow(ref, await load(userId, ref));
}

export async function setManualLocation(
  userId: string,
  ref: PropertyRef,
  latitude: number,
  longitude: number,
): Promise<PropertyLocation> {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new BadRequestError('Latitude must be between -90 and 90');
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new BadRequestError('Longitude must be between -180 and 180');
  }
  await load(userId, ref);
  const data: LocationWrite = { latitude, longitude, locationSource: 'manual', geocodedAt: new Date() };
  await save(ref, data);
  return toLocation(data);
}

/** Forget the pin, hand-placed or looked up, so the address is looked up afresh. */
export async function resetLocation(userId: string, ref: PropertyRef): Promise<void> {
  await load(userId, ref);
  await save(ref, { latitude: null, longitude: null, locationSource: null, geocodedAddress: null, geocodedAt: null });
}

export interface ListedLocation extends PropertyLocation {
  id: string;
  /** Not looked up yet — ask again shortly. */
  pending: boolean;
}

/** Every property's pin for the list-page map, looking a few new addresses up per call. */
export async function listLocations(userId: string, type: PropertyOwnerType): Promise<ListedLocation[]> {
  const rows: LocatedRow[] =
    type === 'OWNED_PROPERTY'
      ? await prisma.ownedProperty.findMany({
          where: { userId },
          select: { id: true, address: true, city: true, state: true, pincode: true, country: true, ...LOCATION_SELECT },
        })
      : await prisma.rentalProperty.findMany({
          where: { userId },
          select: { id: true, address: true, ...LOCATION_SELECT },
        });

  let budget = LIST_LOOKUP_BUDGET;
  const out: ListedLocation[] = [];
  for (const row of rows) {
    const ref: PropertyRef = { type, id: row.id };
    const address = fullAddress(ref, row);
    const settled =
      (row.locationSource === 'manual' && row.latitude !== null) || !address || row.geocodedAddress === address;
    if (settled) {
      out.push({ id: row.id, ...toLocation(row), pending: false });
    } else if (budget > 0) {
      budget -= 1;
      out.push({ id: row.id, ...(await locateRow(ref, row)), pending: false });
    } else {
      out.push({ id: row.id, ...toLocation(row), pending: true });
    }
  }
  return out;
}
