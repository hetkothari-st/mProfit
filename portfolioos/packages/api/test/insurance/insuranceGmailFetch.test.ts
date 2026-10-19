import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { buildInsuranceScanQuery } from '../../src/ingestion/gmail/gmailMessageLister.js';
import { insurerForAddress } from '../../src/data/insurers.js';
import {
  getInsuranceFetchStatus,
  scanInsuranceNow,
  setInsuranceFetch,
} from '../../src/services/insurance/insuranceGmailFetch.service.js';

/**
 * Insurance documents are read from Gmail only with the user's permission,
 * per account, and only from insurers or with an insurance subject line —
 * never the whole inbox.
 */
describe('insurance Gmail search query', () => {
  const q = buildInsuranceScanQuery(new Date('2023-10-20T00:00:00Z'), new Date('2026-10-20T00:00:00Z'));

  it('asks only for PDFs from insurers or with an insurance subject', () => {
    expect(q.startsWith('filename:pdf has:attachment (from:(')).toBe(true);
    expect(q).toContain('licindia.in');
    expect(q).toContain('starhealth.in');
    expect(q).toContain('subject:("policy document" OR ');
    expect(q).toContain('"premium receipt"');
  });

  it('covers the whole last day', () => {
    expect(q.endsWith('after:2023/10/20 before:2026/10/21')).toBe(true);
  });

  it('recognises insurer addresses, including subdomains', () => {
    expect(insurerForAddress('ebiz@ebiz.licindia.in')?.id).toBe('lic');
    expect(insurerForAddress('noreply@hdfclife.com')?.id).toBe('hdfc-life');
    expect(insurerForAddress('alerts@hdfcbank.net')).toBeNull();
    expect(insurerForAddress('x@notlicindia.in')).toBeNull();
  });
});

describe('insurance Gmail permission', () => {
  let scope: TestScope;
  let mailboxId: string;

  beforeAll(async () => {
    scope = await createTestScope('ins-gmail');
    const mb = await runAsSystem(() =>
      prisma.mailboxAccount.create({
        data: { userId: scope.userId, provider: 'GMAIL_OAUTH', googleEmail: 'test@example.com' },
      }),
    );
    mailboxId = mb.id;
  });
  afterAll(async () => {
    await runAsSystem(async () => {
      await prisma.gmailScanJob.deleteMany({ where: { userId: scope.userId } });
      await prisma.mailboxAccount.deleteMany({ where: { userId: scope.userId } });
      await prisma.auditLog.deleteMany({ where: { userId: scope.userId } });
    });
    await scope.cleanup();
  });

  it('is off until the user turns it on, and "scan now" is refused meanwhile', async () => {
    const status = await scope.runAs(() => getInsuranceFetchStatus(scope.userId));
    expect(status.mailboxes).toEqual([
      expect.objectContaining({ mailboxId, enabled: false, consentAt: null, lastScan: null }),
    ]);
    await expect(scope.runAs(() => scanInsuranceNow(scope.userId, mailboxId))).rejects.toThrow(/not turned on/);
  });

  it('turning it on records consent, audits it and starts a three-year insurance scan', async () => {
    const r = await scope.runAs(() => setInsuranceFetch(scope.userId, mailboxId, true));
    expect(r.enabled).toBe(true);
    expect(r.scan?.kind).toBe('INSURANCE');
    const years = r.scan!.lookbackTo.getUTCFullYear() - r.scan!.lookbackFrom.getUTCFullYear();
    expect(years).toBe(3);

    const mb = await runAsSystem(() => prisma.mailboxAccount.findUniqueOrThrow({ where: { id: mailboxId } }));
    expect(mb.insuranceFetchEnabled).toBe(true);
    expect(mb.insuranceFetchConsentAt).not.toBeNull();
    const audit = await runAsSystem(() =>
      prisma.auditLog.findMany({ where: { userId: scope.userId, action: 'insurance_gmail_fetch_enabled' } }),
    );
    expect(audit).toHaveLength(1);

    // A second "scan now" while one is running returns the same scan.
    const again = await scope.runAs(() => scanInsuranceNow(scope.userId, mailboxId));
    expect(again.id).toBe(r.scan!.id);
  });

  it('turning it off withdraws permission and cancels the running scan', async () => {
    await scope.runAs(() => setInsuranceFetch(scope.userId, mailboxId, false));
    const mb = await runAsSystem(() => prisma.mailboxAccount.findUniqueOrThrow({ where: { id: mailboxId } }));
    expect(mb.insuranceFetchEnabled).toBe(false);
    expect(mb.insuranceFetchConsentAt).toBeNull();
    const scans = await runAsSystem(() => prisma.gmailScanJob.findMany({ where: { mailboxId } }));
    expect(scans.every((s) => s.status === 'CANCELLED')).toBe(true);
    const audit = await runAsSystem(() =>
      prisma.auditLog.count({ where: { userId: scope.userId, action: 'insurance_gmail_fetch_disabled' } }),
    );
    expect(audit).toBe(1);
  });
});
