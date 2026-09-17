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

  // Passbook rows land as canonical events (sourceRef = the account id), not
  // as transactions, so the ledger and balance are read from there.
  const events = accounts.length
    ? await prisma.canonicalEvent.findMany({
        where: {
          userId,
          sourceRef: { in: accounts.map((a) => a.id) },
          eventType: { in: [...PF_EVENT_TYPES] },
          status: { in: ['CONFIRMED', 'PROJECTED'] },
        },
        orderBy: { eventDate: 'asc' },
        select: { sourceRef: true, eventType: true, eventDate: true, amount: true, metadata: true },
      })
    : [];
  const eventsByAccount = new Map<string, typeof events>();
  for (const e of events) {
    const list = eventsByAccount.get(e.sourceRef) ?? [];
    list.push(e);
    eventsByAccount.set(e.sourceRef, list);
  }

  const balanceOf = (a: (typeof accounts)[number]): { balance: Decimal; asOf: Date | null } | null => {
    if (a.currentBalance != null) return { balance: new Decimal(a.currentBalance.toString()), asOf: a.lastRefreshedAt };
    const list = eventsByAccount.get(a.id) ?? [];
    if (list.length === 0) return null;
    return { balance: passbookBalance(list), asOf: list[list.length - 1]!.eventDate };
  };
  const balances = new Map(accounts.map((a) => [a.id, balanceOf(a)]));

  const rows = accounts.map((a) => ({
    type: TYPE_LABEL[a.type] ?? a.type,
    institution: a.institution.replace(/_/g, ' '),
    account: `••••${a.identifierLast4}`,
    holder: a.holderName,
    status: STATUS_LABEL[a.status] ?? a.status,
    // No balance on file and no passbook rows: shown blank, never as zero.
    balance: balances.get(a.id)?.balance.toString() ?? null,
    asOf: balances.get(a.id)?.asOf ?? null,
  }));

  const total = accounts.reduce((sum, a) => {
    const b = balances.get(a.id);
    return b ? sum.plus(b.balance) : sum;
  }, new Decimal(0));
  const unrefreshed = accounts.filter((a) => !balances.get(a.id)).length;

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

  // Contributions, interest and withdrawals from the passbook, in the period.
  const accountLabel = new Map(accounts.map((a) => [a.id, `${a.type} ••••${a.identifierLast4}`]));
  const inPeriod = events.filter(
    (e) => (!from || e.eventDate >= from) && (!to || e.eventDate <= to),
  );
  if (inPeriod.length > 0) {
    sections.push({
      title: from || to ? 'Contributions and interest (selected period)' : 'Contributions and interest',
      columns: [
        { key: 'date', header: 'Date', width: 12, formatter: fmtDate },
        { key: 'account', header: 'Account', width: 28 },
        { key: 'kind', header: 'Type', width: 22 },
        { key: 'amount', header: 'Amount', width: 16, formatter: (v) => fmtNum(v) },
        { key: 'narration', header: 'Narration', width: 40 },
      ],
      rows: inPeriod.map((e) => ({
        date: e.eventDate,
        account: accountLabel.get(e.sourceRef) ?? '—',
        kind: PF_EVENT_LABEL[e.eventType] ?? e.eventType,
        amount: signedPfAmount(e.eventType, e.amount).toString(),
        narration: (e.metadata as { notes?: string | null } | null)?.notes ?? '—',
      })),
    });
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
        ? { 'No balance available': `${unrefreshed} account(s) — not included in the total` }
        : {}),
    },
    mainSectionLabel: 'Accounts',
    additionalSections: sections,
  };
}

const PF_EVENT_TYPES = [
  'PF_OPENING_BALANCE',
  'PF_EMPLOYEE_CONTRIBUTION',
  'PF_EMPLOYER_CONTRIBUTION',
  'PF_VPF_CONTRIBUTION',
  'PF_INTEREST_CREDIT',
  'PF_TRANSFER_IN',
  'PF_TRANSFER_OUT',
  'PF_WITHDRAWAL',
] as const;

const PF_EVENT_LABEL: Record<string, string> = {
  PF_OPENING_BALANCE: 'Opening balance',
  PF_EMPLOYEE_CONTRIBUTION: 'Employee contribution',
  PF_EMPLOYER_CONTRIBUTION: 'Employer contribution',
  PF_VPF_CONTRIBUTION: 'Voluntary contribution',
  PF_INTEREST_CREDIT: 'Interest',
  PF_TRANSFER_IN: 'Transfer in',
  PF_TRANSFER_OUT: 'Transfer out',
  PF_WITHDRAWAL: 'Withdrawal',
};

/** Money leaving the account is negative. */
function signedPfAmount(type: string, amount: { toString(): string } | null): Decimal {
  const value = new Decimal(amount?.toString() ?? '0').abs();
  return type === 'PF_WITHDRAWAL' || type === 'PF_TRANSFER_OUT' ? value.negated() : value;
}

/**
 * Balance from passbook rows. Each year's passbook restates the opening
 * balance, so per member id (one per employer) the balance is its latest
 * opening balance plus every movement from that date on — never a sum of
 * every year's opening.
 */
export function passbookBalance(
  events: Array<{ eventType: string; eventDate: Date; amount: { toString(): string } | null; metadata: unknown }>,
): Decimal {
  const byMember = new Map<string, typeof events>();
  for (const e of events) {
    const member = String((e.metadata as { memberIdLast4?: string | null } | null)?.memberIdLast4 ?? '');
    const list = byMember.get(member) ?? [];
    list.push(e);
    byMember.set(member, list);
  }
  let total = new Decimal(0);
  for (const list of byMember.values()) {
    const openings = list.filter((e) => e.eventType === 'PF_OPENING_BALANCE');
    const latest = openings[openings.length - 1];
    const start = latest ? latest.eventDate.getTime() : Number.NEGATIVE_INFINITY;
    let balance = latest ? signedPfAmount(latest.eventType, latest.amount) : new Decimal(0);
    for (const e of list) {
      if (e.eventType === 'PF_OPENING_BALANCE' || e.eventDate.getTime() < start) continue;
      balance = balance.plus(signedPfAmount(e.eventType, e.amount));
    }
    total = total.plus(balance);
  }
  return total;
}
