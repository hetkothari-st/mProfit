import { describe, it, expect } from 'vitest';
import { priceAsOfLabel } from './priceAsOfLabel';

// Prices are stored one row per trading day, so their as-of is a date at UTC
// midnight. Reading it as a moment printed "as of about 9 hours ago" beside a
// price fetched minutes earlier.
describe('priceAsOfLabel', () => {
  const now = new Date('2026-11-04T08:50:00Z'); // 14:20 IST

  it("calls today's trading-day price today's price, not hours ago", () => {
    expect(priceAsOfLabel('2026-11-04T00:00:00.000Z', now).text).toBe("today's price");
  });

  it('names an older trading day by date', () => {
    expect(priceAsOfLabel('2026-11-03T00:00:00.000Z', now).text).toMatch(/^price of 03\/11\/2026$/);
  });

  it('keeps relative time for a real timestamp', () => {
    expect(priceAsOfLabel('2026-11-04T08:20:00.000Z', now).text).toMatch(/^as of .*ago$/);
  });
});
