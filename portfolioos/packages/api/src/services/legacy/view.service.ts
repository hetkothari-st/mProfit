import {
  Decimal, LEGACY_CATEGORY_LABELS, LEGACY_CLAIM_CHECKLIST,
  type LegacyCategory, type LegacyItemDTO, type LegacySectionDTO, type LegacyViewDTO,
} from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';
import { runAsSystem, runAsUser } from '../../lib/requestContext.js';
import { decryptSecret } from '../../lib/secrets.js';
import { NotFoundError } from '../../lib/errors.js';
import { readBuffer } from '../../lib/documentStorage.js';
import { willDocumentTags } from '../documents/document.service.js';

/**
 * The nominee's read-only view. Owner data is read under runAsUser(owner) so
 * RLS still scopes every row to that one owner, and only find* calls are made.
 * Scope is enforced here, on the server: categories outside the nominee's
 * scope are never loaded, and with showAmounts off no figure is emitted at all.
 * Identifiers are last-4 only (design: full numbers never go to nominees in v1).
 */

type Amt = { toString(): string } | null | undefined;
type RawItem = LegacyItemDTO & { raw: Amt };

/** Asset categories that add up to the "total of listed assets". */
const SUMMED: ReadonlySet<LegacyCategory> = new Set(['INVESTMENTS', 'BANK_ACCOUNTS', 'PROPERTY', 'VEHICLES', 'RETIREMENT']);

function item(label: string, o: { sublabel?: string | null; identifierLast4?: string | null; nominee?: string | null; amount?: Amt; notes?: string[] }): RawItem {
  return {
    label, sublabel: o.sublabel ?? null, identifierLast4: o.identifierLast4 ?? null, nominee: o.nominee ?? null,
    amount: null, notes: o.notes ?? [], raw: o.amount ?? null,
  };
}

const joined = (...parts: Array<string | null | undefined>) => parts.filter(Boolean).join(' · ') || null;

function nomineeNames(json: unknown): string | null {
  if (!Array.isArray(json)) return null;
  const names = json
    .map((x) => (x && typeof x === 'object' && 'name' in x ? String((x as { name: unknown }).name) : null))
    .filter((x): x is string => Boolean(x));
  return names.length ? names.join(', ') : null;
}

async function loadCategory(ownerId: string, c: LegacyCategory): Promise<RawItem[]> {
  switch (c) {
    case 'INVESTMENTS': {
      const rows = await prisma.holdingProjection.findMany({
        where: { portfolio: { userId: ownerId }, quantity: { gt: 0 } }, orderBy: { assetClass: 'asc' },
      });
      return rows.map((h) => item(h.assetName ?? h.isin ?? 'Holding', { sublabel: h.assetClass, amount: h.currentValue ?? h.totalCost }));
    }
    case 'BANK_ACCOUNTS': {
      const rows = await prisma.bankAccount.findMany({ where: { userId: ownerId, status: { not: 'CLOSED' } } });
      return rows.map((b) => item(b.bankName, {
        sublabel: joined(b.accountType, b.branch), identifierLast4: b.last4, nominee: b.nomineeName,
        amount: b.currentBalance, notes: b.ifsc ? [`IFSC ${b.ifsc}`] : [],
      }));
    }
    case 'INSURANCE': {
      const rows = await prisma.insurancePolicy.findMany({ where: { userId: ownerId, status: 'ACTIVE' } });
      return rows.map((p) => item([p.insurer, p.planName].filter(Boolean).join(' '), {
        sublabel: p.type, identifierLast4: p.policyNumberLast4, nominee: nomineeNames(p.nominees), amount: p.sumAssured,
      }));
    }
    case 'LIABILITIES': {
      const loans = await prisma.loan.findMany({ where: { userId: ownerId, status: 'ACTIVE' } });
      const cards = await prisma.creditCard.findMany({ where: { userId: ownerId, status: 'ACTIVE' } });
      return [
        ...loans.map((l) => item(`${l.lenderName} ${l.loanType}`, {
          sublabel: `EMI on day ${l.emiDueDay}`, identifierLast4: l.accountNumberLast4, amount: l.emiAmount,
          notes: ['Action needed: inform the lender'],
        })),
        ...cards.map((k) => item(`${k.issuerBank} ${k.cardName}`, {
          sublabel: k.network, identifierLast4: k.last4, amount: k.outstandingBalance, notes: ['Action needed: block the card'],
        })),
      ];
    }
    case 'PROPERTY': {
      const rows = await prisma.ownedProperty.findMany({ where: { userId: ownerId, status: { not: 'SOLD' } } });
      return rows.map((p) => item(p.name, { sublabel: joined(p.city, p.ownershipType), amount: p.currentValue }));
    }
    case 'VEHICLES': {
      const rows = await prisma.vehicle.findMany({ where: { userId: ownerId } });
      return rows.map((v) => item([v.make, v.model].filter(Boolean).join(' ') || 'Vehicle', {
        sublabel: v.fuelType, identifierLast4: v.registrationNoLast4, amount: v.currentValue,
      }));
    }
    case 'RETIREMENT': {
      const rows = await prisma.providentFundAccount.findMany({ where: { userId: ownerId } });
      return rows.map((r) => item(`${r.type} · ${r.institution}`, {
        sublabel: r.holderName, identifierLast4: r.identifierLast4, amount: r.currentBalance,
      }));
    }
    case 'DOCUMENTS':
    case 'LETTER':
      return [];
  }
}

async function loadReleased(ownerId: string, nomineeId: string) {
  const [plan, nominee] = await runAsSystem(() => Promise.all([
    prisma.legacyPlan.findUnique({ where: { userId: ownerId } }),
    prisma.legacyNominee.findUnique({ where: { id: nomineeId } }),
  ]));
  if (!plan || plan.status !== 'RELEASED' || !nominee || nominee.planId !== plan.id) {
    throw new NotFoundError('Nothing is shared with you right now.');
  }
  return { plan, nominee };
}

export async function buildLegacyView(ownerId: string, nomineeId: string): Promise<LegacyViewDTO> {
  const { plan, nominee } = await loadReleased(ownerId, nomineeId);
  const cats = nominee.categories as LegacyCategory[];
  const owner = await runAsSystem(() => prisma.user.findUniqueOrThrow({ where: { id: ownerId }, select: { name: true } }));
  let total = new Decimal(0);
  const sections: LegacySectionDTO[] = [];
  const documents = await runAsUser(ownerId, async () => {
    for (const c of cats) {
      if (c === 'DOCUMENTS' || c === 'LETTER') continue;
      const items = (await loadCategory(ownerId, c)).map(({ raw, ...it }) => {
        if (!nominee.showAmounts || raw == null) return it;
        const d = new Decimal(raw.toString());
        if (SUMMED.has(c)) total = total.plus(d);
        return { ...it, amount: d.toString() };
      });
      sections.push({ category: c, title: LEGACY_CATEGORY_LABELS[c], items, checklist: LEGACY_CLAIM_CHECKLIST[c] });
    }
    if (!cats.includes('DOCUMENTS') || nominee.documentIds.length === 0) return [];
    const docs = await prisma.document.findMany({
      where: { userId: ownerId, id: { in: nominee.documentIds } },
      select: { id: true, fileName: true, category: true, ownerType: true, ownerId: true },
    });
    const tags = await willDocumentTags(ownerId, docs);
    return docs.map((d) => ({
      id: d.id, fileName: d.fileName, category: d.category,
      ...(d.ownerType === 'WILL' ? { will: tags.get(d.id) ?? null } : {}),
    }));
  });
  return {
    ownerName: owner.name,
    nomineeName: decryptSecret(nominee.nameEnc),
    releasedAt: (plan.releasedAt ?? plan.updatedAt).toISOString(),
    showAmounts: nominee.showAmounts,
    netWorth: nominee.showAmounts ? total.toString() : null,
    sections,
    letter: cats.includes('LETTER') && plan.letterEnc ? decryptSecret(plan.letterEnc) : null,
    documents,
  };
}

export async function loadViewDocument(
  ownerId: string, nomineeId: string, documentId: string,
): Promise<{ fileName: string; mimeType: string; bytes: Buffer }> {
  const { nominee } = await loadReleased(ownerId, nomineeId);
  if (!(nominee.categories as string[]).includes('DOCUMENTS') || !nominee.documentIds.includes(documentId)) {
    throw new NotFoundError('Document not found');
  }
  return runAsUser(ownerId, async () => {
    const doc = await prisma.document.findFirst({ where: { id: documentId, userId: ownerId } });
    if (!doc) throw new NotFoundError('Document not found');
    return { fileName: doc.fileName, mimeType: doc.mimeType, bytes: await readBuffer(ownerId, doc.storageKey) };
  });
}

export { renderLegacyPdf } from './viewPdf.js';
