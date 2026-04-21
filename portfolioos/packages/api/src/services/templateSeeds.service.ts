/**
 * §6.10 TemplateSeed directory reads.
 *
 * Pre-seeded `TemplateSeed` rows carry institution metadata for the
 * addresses real Indian banks / brokers / insurers / registrars send
 * from. Two read paths use them:
 *
 *   1. Discovery enrichment — `findSeedsForAddresses` resolves raw
 *      sender addresses to their institution labels so the §6.6 UI
 *      shows "HDFC Bank" next to `alerts@hdfcbank.net`.
 *   2. Monitored-sender create — `findSeedForAddress` auto-fills the
 *      displayLabel when the user whitelists a sender that matches a
 *      seed and didn't supply their own label.
 *
 * Writes happen only in migrations (§6.10 seed inserts). The service
 * is intentionally read-only.
 */

import { prisma } from '../lib/prisma.js';

export async function findSeedForAddress(address: string) {
  const normalized = address.trim().toLowerCase();
  if (!normalized) return null;
  return prisma.templateSeed.findUnique({
    where: { address: normalized },
  });
}

export async function findSeedsForAddresses(addresses: readonly string[]) {
  if (addresses.length === 0) return new Map<string, NonNullable<Awaited<ReturnType<typeof findSeedForAddress>>>>();
  const normalized = Array.from(
    new Set(addresses.map((a) => a.trim().toLowerCase()).filter(Boolean)),
  );
  const rows = await prisma.templateSeed.findMany({
    where: { address: { in: normalized }, isActive: true },
  });
  const byAddress = new Map<string, (typeof rows)[number]>();
  for (const row of rows) byAddress.set(row.address, row);
  return byAddress;
}

export async function listActiveSeeds() {
  return prisma.templateSeed.findMany({
    where: { isActive: true },
    orderBy: [{ institutionKind: 'asc' }, { institutionName: 'asc' }],
  });
}
