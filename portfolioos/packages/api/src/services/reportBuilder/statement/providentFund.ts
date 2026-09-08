/**
 * Provident fund statement — EPF and PPF.
 *
 * The first export of this data the product has ever had. PF has a full
 * ingestion stack behind it (the EPFO scraper, seven bank PPF adapters, the
 * OTP session machinery) and the balances surface inside holdings reports as
 * an asset class, but until now there was no way to put a passbook in front of
 * anyone. A CA reconciling a client's 80C claim or a member checking their own
 * contributions had nothing to download.
 *
 * SECRETS ARE NEVER SELECTED. `ProvidentFundAccount` stores an encrypted UAN
 * (`identifierCipher`), a stored-credentials blob and its key id. RLS is
 * row-level, not column-level, so nothing in the database stops a builder
 * reading them — only the `select` below does. It is written explicitly rather
 * than as a spread for that reason, and a test asserts those three column
 * names never appear in this file.
 *
 * The account identifier is shown as its last four digits, which is what the
 * schema keeps for display and all anyone needs to tell two accounts apart.
 */

import { Decimal } from 'decimal.js';
import { prisma } from '../../../lib/prisma.js';
import { fmtNum, fmtDate, type ExportPayload, type ExportSection } from '../../export.service.js';

const TYPE_LABEL: Record<string, string> = {
  EPF: 'Employees’ Provident Fund',
  PPF: 'Public Provident Fund',
};

/**
 * The status values are about whether the CONNECTION still works, not whether
 * the account does — an EPFO login that needs re-authenticating, a locked
 * portal, an institution that changed. Spelled out because "NEEDS_REAUTH" on a
 * statement handed to a client means nothing to them.
 */
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Connected',
  NEEDS_REAUTH: 'Needs sign-in again',
  LOCKED: 'Portal locked',
  INSTITUTION_CHANGED: 'Institution changed',
};

export interface PfStatementParams {
  userId: string;
  /** Optional window for the contribution ledger. Balances are always current. */
  from?: Date;
  to?: Date;
}

export async function buildProvidentFundStatement(
  params: PfStatementParams,
): Promise<ExportPayload> {
  const { userId, from, to } = params;

  const accounts = await prisma.providentFundAccount.findMany({
    where: { userId },
    orderBy: [{ type: 'asc' }, { institution: 'asc' }],
    // Explicit, and deliberately not a spread. See the note at the top: the
    // encrypted identifier, the credentials blob and the key id must never
    // leave this table through a report.
    select: {
      id: true,
      type: true,
      institution: true,
      identifierLast4: true,
      holderName: true,
      branchCode: true,
      status: true,
      currentBalance: true,
      lastRefreshedAt: true,
      assetKey: true,
      memberIds: {
        // memberIdCipher is the encrypted member id and is excluded for the
        // same reason as identifierCipher above.
        select: {
          memberIdLast4: true,
          establishmentName: true,
          dateOfJoining: true,
          dateOfExit: true,
        },
      },
    },
  });

  const rows = accounts.map((a) => ({
    type: TYPE_LABEL[a.type] ?? a.type,
    institution: a.institution.replace(/_/g, ' '),
    account: `••••${a.identifierLast4}`,
    holder: a.holderName,
    status: STATUS_LABEL[a.status] ?? a.status,
    balance: a.currentBalance?.toString() ?? null,
    // A never-refreshed account is not a zero balance; the column says so
    // rather than showing a date that was never true.
    asOf: a.lastRefreshedAt,
  }));

  const total = accounts.reduce(
    (sum, a) => (a.currentBalance ? sum.plus(new Decimal(a.currentBalance.toString())) : sum),
    new Decimal(0),
  );
  const unrefreshed = accounts.filter((a) => !a.lastRefreshedAt).length;

  const sections: ExportSection[] = [];

  // Employer history, which is the part of an EPF passbook a CA actually needs
  // when a client has changed jobs — one UAN, several member ids.
  const employerRows = accounts.flatMap((a) =>
    a.memberIds.map((m) => ({
      account: `••••${a.identifierLast4}`,
      memberId: `••••${m.memberIdLast4}`,
      employer: m.establishmentName,
      joined: m.dateOfJoining,
      left: m.dateOfExit,
    })),
  );
  if (employerRows.length > 0) {
    sections.push({
      title: 'Member IDs and employers',
      columns: [
        { key: 'account', header: 'Account', width: 12 },
        { key: 'memberId', header: 'Member ID', width: 14 },
        { key: 'employer', header: 'Employer', width: 38 },
        { key: 'joined', header: 'Joined', width: 12, formatter: fmtDate },
        { key: 'left', header: 'Left', width: 12, formatter: fmtDate },
      ],
      rows: employerRows,
    });
  }

  // Contributions and interest, sourced from the canonical ledger the PF
  // adapters project into — the same rows every other report reads, so a
  // passbook here cannot disagree with the holdings statement.
  const assetKeys = accounts.map((a) => a.assetKey);
  if (assetKeys.length > 0) {
    const movements = await prisma.transaction.findMany({
      where: {
        portfolio: { userId },
        assetKey: { in: assetKeys },
        ...(from || to
          ? { tradeDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {}),
      },
      orderBy: { tradeDate: 'asc' },
      select: {
        tradeDate: true,
        transactionType: true,
        assetName: true,
        netAmount: true,
        narration: true,
      },
    });

    if (movements.length > 0) {
      sections.push({
        title: from || to ? 'Contributions and interest (selected period)' : 'Contributions and interest',
        columns: [
          { key: 'date', header: 'Date', width: 12, formatter: fmtDate },
          { key: 'account', header: 'Account', width: 28 },
          { key: 'kind', header: 'Type', width: 16 },
          { key: 'amount', header: 'Amount', width: 16, formatter: (v) => fmtNum(v) },
          { key: 'narration', header: 'Narration', width: 40 },
        ],
        rows: movements.map((m) => ({
          date: m.tradeDate,
          account: m.assetName ?? '—',
          kind: m.transactionType,
          amount: m.netAmount.toString(),
          narration: m.narration ?? '—',
        })),
      });
    }
  }

  return {
    title: 'Provident Fund Statement',
    subtitle: 'EPF · PPF',
    filenameStem: 'provident-fund-statement',
    columns: [
      { key: 'type', header: 'Scheme', width: 30 },
      { key: 'institution', header: 'Institution', width: 20 },
      { key: 'account', header: 'Account', width: 12 },
      { key: 'holder', header: 'Holder', width: 26 },
      { key: 'status', header: 'Status', width: 12 },
      { key: 'balance', header: 'Balance', width: 16, formatter: (v) => fmtNum(v) },
      { key: 'asOf', header: 'Balance as of', width: 14, formatter: fmtDate },
    ],
    rows,
    footer: {
      Accounts: String(accounts.length),
      'Total balance': fmtNum(total.toString()),
      // Said plainly. A total that quietly omits accounts nobody has fetched
      // would read as complete when it is not.
      ...(unrefreshed > 0
        ? { 'Never refreshed': `${unrefreshed} account(s) — balance not included` }
        : {}),
    },
    mainSectionLabel: 'Accounts',
    additionalSections: sections,
  };
}
