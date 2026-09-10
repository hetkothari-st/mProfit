import { describe, it, expect, beforeEach, vi } from 'vitest';

// Map pins: looked up once per address, kept when placed by hand, never looked
// up again for an unchanged address, and scoped to the property's owner.

const db = vi.hoisted(() => ({
  ownedProperty: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  rentalProperty: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
}));
vi.mock('../../src/lib/prisma.js', () => ({ prisma: db }));

const nominatim = vi.hoisted(() => ({ searchPlace: vi.fn() }));
vi.mock('../../src/lib/nominatim.js', () => nominatim);

import {
  addressCandidates,
  locateProperty,
  setManualLocation,
  resetLocation,
} from '../../src/services/propertyLocation.service.js';
import { BadRequestError, NotFoundError } from '../../src/lib/errors.js';

const OWNED = { type: 'OWNED_PROPERTY' as const, id: 'op1' };
const RENTAL = { type: 'RENTAL_PROPERTY' as const, id: 'rp1' };

const ownedRow = (over: Record<string, unknown> = {}) => ({
  id: 'op1',
  address: 'Flat 12, Sunrise Apartments, Andheri East',
  city: 'Mumbai',
  state: 'Maharashtra',
  pincode: '400069',
  country: 'IN',
  latitude: null,
  longitude: null,
  locationSource: null,
  geocodedAddress: null,
  ...over,
});
const FULL = 'Flat 12, Sunrise Apartments, Andheri East, Mumbai, Maharashtra, 400069, India';

beforeEach(() => {
  vi.clearAllMocks();
  db.ownedProperty.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...ownedRow(),
    ...data,
  }));
  db.rentalProperty.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => data);
});

describe('addressCandidates', () => {
  it('tries the full address, then ever-broader tails of it', () => {
    expect(addressCandidates(FULL)).toEqual([
      FULL,
      'Sunrise Apartments, Andheri East, Mumbai, Maharashtra, 400069, India',
      'Andheri East, Mumbai, Maharashtra, 400069, India',
      'Mumbai, Maharashtra, 400069, India',
    ]);
  });

  it('keeps a short address as it is', () => {
    expect(addressCandidates('Koregaon Park, Pune')).toEqual(['Koregaon Park, Pune']);
    expect(addressCandidates('   ')).toEqual([]);
  });
});

describe('locateProperty', () => {
  it('looks the address up once and saves the pin', async () => {
    db.ownedProperty.findFirst.mockResolvedValue(ownedRow());
    nominatim.searchPlace.mockResolvedValue({ lat: 19.1136, lon: 72.8697 });

    const loc = await locateProperty('u1', OWNED);

    expect(db.ownedProperty.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'op1', userId: 'u1' } }),
    );
    expect(nominatim.searchPlace).toHaveBeenCalledWith(FULL, 'in');
    expect(db.ownedProperty.update.mock.calls[0]![0].data).toMatchObject({
      latitude: 19.1136,
      longitude: 72.8697,
      locationSource: 'geocoded',
      geocodedAddress: FULL,
    });
    expect(loc).toMatchObject({ latitude: 19.1136, longitude: 72.8697, source: 'geocoded' });
  });

  it('marks the pin approximate when only a broader part of the address is found', async () => {
    db.ownedProperty.findFirst.mockResolvedValue(ownedRow());
    nominatim.searchPlace
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ lat: 19.11, lon: 72.86 });
    const loc = await locateProperty('u1', OWNED);
    expect(loc.source).toBe('approximate');
    expect(nominatim.searchPlace).toHaveBeenCalledTimes(3);
  });

  it('keeps a pin placed by hand', async () => {
    db.ownedProperty.findFirst.mockResolvedValue(
      ownedRow({ latitude: 18.5, longitude: 73.8, locationSource: 'manual' }),
    );
    const loc = await locateProperty('u1', OWNED);
    expect(nominatim.searchPlace).not.toHaveBeenCalled();
    expect(loc).toMatchObject({ latitude: 18.5, longitude: 73.8, source: 'manual' });
  });

  it('does not look up an unchanged address again, even one that found nothing', async () => {
    db.ownedProperty.findFirst.mockResolvedValue(ownedRow({ geocodedAddress: FULL }));
    const loc = await locateProperty('u1', OWNED);
    expect(nominatim.searchPlace).not.toHaveBeenCalled();
    expect(loc).toMatchObject({ latitude: null, longitude: null });
  });

  it('looks up again once the address has changed', async () => {
    db.ownedProperty.findFirst.mockResolvedValue(
      ownedRow({ latitude: 1, longitude: 2, locationSource: 'geocoded', geocodedAddress: 'Old address, Pune' }),
    );
    nominatim.searchPlace.mockResolvedValue({ lat: 19.1, lon: 72.8 });
    await locateProperty('u1', OWNED);
    expect(nominatim.searchPlace).toHaveBeenCalled();
  });

  it('remembers an address that found nothing, with no pin', async () => {
    db.rentalProperty.findFirst.mockResolvedValue({
      id: 'rp1',
      address: 'Nowhere Lane',
      latitude: null,
      longitude: null,
      locationSource: null,
      geocodedAddress: null,
    });
    nominatim.searchPlace.mockResolvedValue(null);
    const loc = await locateProperty('u1', RENTAL);
    expect(db.rentalProperty.update.mock.calls[0]![0].data).toMatchObject({
      latitude: null,
      longitude: null,
      locationSource: null,
      geocodedAddress: 'Nowhere Lane',
    });
    expect(loc).toMatchObject({ latitude: null, longitude: null });
  });

  it("doesn't record anything when the lookup service fails, so it's tried again later", async () => {
    db.ownedProperty.findFirst.mockResolvedValue(ownedRow());
    nominatim.searchPlace.mockRejectedValue(new Error('network down'));
    const loc = await locateProperty('u1', OWNED);
    expect(db.ownedProperty.update).not.toHaveBeenCalled();
    expect(loc).toMatchObject({ latitude: null, longitude: null, source: null });
  });

  it('has no pin and makes no lookup without an address', async () => {
    db.rentalProperty.findFirst.mockResolvedValue({ id: 'rp1', address: null, latitude: null, longitude: null, locationSource: null, geocodedAddress: null });
    const loc = await locateProperty('u1', RENTAL);
    expect(nominatim.searchPlace).not.toHaveBeenCalled();
    expect(loc.latitude).toBeNull();
  });

  it("404s on another user's property", async () => {
    db.ownedProperty.findFirst.mockResolvedValue(null);
    await expect(locateProperty('u2', OWNED)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('setManualLocation / resetLocation', () => {
  it('saves a hand-placed pin', async () => {
    db.ownedProperty.findFirst.mockResolvedValue(ownedRow());
    await setManualLocation('u1', OWNED, 19.2, 72.9);
    expect(db.ownedProperty.update.mock.calls[0]![0].data).toMatchObject({
      latitude: 19.2,
      longitude: 72.9,
      locationSource: 'manual',
    });
  });

  it('rejects coordinates off the globe', async () => {
    db.ownedProperty.findFirst.mockResolvedValue(ownedRow());
    await expect(setManualLocation('u1', OWNED, 91, 72)).rejects.toBeInstanceOf(BadRequestError);
    await expect(setManualLocation('u1', OWNED, 19, 181)).rejects.toBeInstanceOf(BadRequestError);
    expect(db.ownedProperty.update).not.toHaveBeenCalled();
  });

  it('reset clears the pin so the address is looked up afresh', async () => {
    db.ownedProperty.findFirst.mockResolvedValue(ownedRow({ locationSource: 'manual', latitude: 1, longitude: 2 }));
    await resetLocation('u1', OWNED);
    expect(db.ownedProperty.update.mock.calls[0]![0].data).toEqual({
      latitude: null,
      longitude: null,
      locationSource: null,
      geocodedAddress: null,
      geocodedAt: null,
    });
  });
});
