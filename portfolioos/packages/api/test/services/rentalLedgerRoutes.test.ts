import { describe, it, expect } from 'vitest';
import { rentalRouter } from '../../src/routes/rental.routes.js';

/**
 * The khata routes must be registered, and `/tenancies/:id/ledger` must be
 * declared before any bare `/tenancies/:tenancyId` route so Express does not
 * swallow the more specific path.
 */
function paths(): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (rentalRouter as any).stack
    .filter((l: any) => l.route)
    .map((l: any) => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`);
}

describe('rental ledger routes', () => {
  it('registers every khata endpoint', () => {
    const p = paths();
    expect(p).toContain('GET /tenancies/:tenancyId/ledger');
    expect(p).toContain('POST /tenancies/:tenancyId/entries');
    expect(p).toContain('PATCH /entries/:entryId');
    expect(p).toContain('DELETE /entries/:entryId');
    expect(p).toContain('GET /collections');
    expect(p).toContain('GET /tenancies/:tenancyId/reminder-link');
    expect(p).toContain('GET /tenancies/:tenancyId/statement');
  });

  it('declares /tenancies/:tenancyId/ledger before the bare /tenancies/:tenancyId routes', () => {
    const p = paths();
    const ledgerIdx = p.indexOf('GET /tenancies/:tenancyId/ledger');
    const bareIdx = p.findIndex((x) => x === 'PATCH /tenancies/:tenancyId' || x === 'DELETE /tenancies/:tenancyId');
    expect(ledgerIdx).toBeGreaterThanOrEqual(0);
    expect(bareIdx).toBeGreaterThanOrEqual(0);
    expect(ledgerIdx).toBeLessThan(bareIdx);
  });
});
