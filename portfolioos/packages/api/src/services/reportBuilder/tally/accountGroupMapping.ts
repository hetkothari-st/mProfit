/**
 * Maps this app's `Account` rows onto Tally's predefined ("reserved")
 * Group names, so every exported <LEDGER> has a <PARENT> Tally already
 * understands with no manual Group setup in the destination company.
 *
 * Canonical list (help.tallysolutions.com — "Predefined Groups in Tally"):
 * 15 Primary Groups + 13 Sub-Groups = 28 reserved names. Spelling/case is
 * exact and load-bearing — Tally matches <PARENT> by exact string.
 */
export const TALLY_RESERVED_GROUPS = [
  // Primary Groups (15)
  'Branch / Divisions',
  'Capital Account',
  'Current Assets',
  'Current Liabilities',
  'Direct Expenses',
  'Direct Incomes',
  'Fixed Assets',
  'Indirect Expenses',
  'Indirect Incomes',
  'Investments',
  'Loans (Liability)',
  'Misc. Expenses (ASSET)',
  'Purchase Accounts',
  'Sales Accounts',
  'Suspense A/c',
  // Sub-Groups (13)
  'Bank Accounts',
  'Bank OD A/c',
  'Cash-in-Hand',
  'Deposits (Asset)',
  'Duties & Taxes',
  'Loans & Advances (Asset)',
  'Provisions',
  'Reserves & Surplus',
  'Secured Loans',
  'Stock-in-Hand',
  'Sundry Creditors',
  'Sundry Debtors',
  'Unsecured Loans',
] as const;

export type TallyReservedGroup = (typeof TALLY_RESERVED_GROUPS)[number];

type AccountLike = { type: 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE' | 'EQUITY'; name: string; code: string };

/**
 * Exact-code overrides for this app's hardcoded `DEFAULT_COA`
 * (accounting.service.ts:8-44) — the ~27 accounts every user gets via
 * `ensureDefaultAccounts`. Checked first because it's precise; falls
 * through to name-substring heuristics, then a per-AccountType default,
 * for any user-created custom account that doesn't match one of these
 * codes.
 *
 * Rationale per row:
 * - 1000 Assets / 1100 Investments are this app's own bucket headers
 *   (no reserved Tally equivalent for a bare "Assets" group) — bucket
 *   rows still get exported as real ledgers (matching how
 *   buildChartOfAccountsLayout treats them), so they need *some* mapping;
 *   default to the closest reserved group for their contents.
 * - 1001 Bank Accounts / 1002 Cash in Hand map 1:1 to Tally's own
 *   reserved sub-groups of the same purpose.
 * - 1101/1102/1104/1105 (equity/MF/bonds/gold holdings) → "Investments":
 *   Tally's reserved "Investments" primary group is exactly for
 *   non-trade holdings like these.
 * - 1103 Fixed Deposits → "Deposits (Asset)": a more precise reserved
 *   sub-group than generic Investments for bank/post-office deposits.
 * - 2001 Loans & Borrowings → "Loans (Liability)": kept at the primary-
 *   group level rather than guessing Secured vs Unsecured, since this app
 *   doesn't track that distinction and guessing wrong misclassifies debt.
 * - 3002 Retained Earnings → "Reserves & Surplus": Tally's precise
 *   reserved sub-group for accumulated profit/loss carry-forward.
 * - 4xxx (all income) → "Indirect Incomes": this app models personal
 *   investment accounting, not a trading business — Tally's "Direct
 *   Income" is for income from the core traded goods of a business,
 *   which doesn't apply here, so every income account (dividend,
 *   interest, capital gains, rental, other) is non-operating/"Indirect".
 * - 5002 STT & Transaction Tax → "Duties & Taxes": exact reserved-group
 *   fit for a statutory tax line.
 * - 5xxx (remaining expenses) → "Indirect Expenses": mirrors the income
 *   reasoning above — none of these are cost-of-goods for a trade.
 */
const EXACT_CODE_OVERRIDES: Record<string, TallyReservedGroup> = {
  '1000': 'Current Assets',
  '1001': 'Bank Accounts',
  '1002': 'Cash-in-Hand',
  '1100': 'Investments',
  '1101': 'Investments',
  '1102': 'Investments',
  '1103': 'Deposits (Asset)',
  '1104': 'Investments',
  '1105': 'Investments',
  '2000': 'Current Liabilities',
  '2001': 'Loans (Liability)',
  '3000': 'Capital Account',
  '3001': 'Capital Account',
  '3002': 'Reserves & Surplus',
  '4000': 'Indirect Incomes',
  '4001': 'Indirect Incomes',
  '4002': 'Indirect Incomes',
  '4003': 'Indirect Incomes',
  '4004': 'Indirect Incomes',
  '4005': 'Indirect Incomes',
  '4006': 'Indirect Incomes',
  '5000': 'Indirect Expenses',
  '5001': 'Indirect Expenses',
  '5002': 'Duties & Taxes',
  '5003': 'Indirect Expenses',
  '5004': 'Indirect Expenses',
  '5005': 'Indirect Expenses',
  '5006': 'Indirect Expenses',
  '5007': 'Indirect Expenses',
  '5008': 'Indirect Expenses',
  // Indian-individual heads. Tax paid or deducted is recoverable against the
  // year's liability, so it sits with advances, not "Duties & Taxes" (where
  // the name heuristic would put anything called "tax").
  '1003': 'Loans & Advances (Asset)',
  '1107': 'Investments',
  '1108': 'Investments',
  '1109': 'Investments',
  '1200': 'Loans & Advances (Asset)',
  '1201': 'Loans & Advances (Asset)',
  '1202': 'Loans & Advances (Asset)',
  '1203': 'Loans & Advances (Asset)',
  '1204': 'Loans & Advances (Asset)',
  '2002': 'Current Liabilities',
  '4009': 'Indirect Incomes',
  '4010': 'Indirect Incomes',
  '4011': 'Indirect Incomes',
  '5012': 'Indirect Expenses',
  '5013': 'Indirect Expenses',
  '5014': 'Indirect Expenses',
};

/** Name-substring heuristics for custom (non-DEFAULT_COA) accounts, checked in order. */
const NAME_HEURISTICS: Array<{ pattern: RegExp; group: TallyReservedGroup }> = [
  { pattern: /\bbank\b/i, group: 'Bank Accounts' },
  { pattern: /\bcash\b/i, group: 'Cash-in-Hand' },
  { pattern: /\b(broker|demat)\b/i, group: 'Investments' },
  { pattern: /\bfixed deposit|FD\b/i, group: 'Deposits (Asset)' },
  { pattern: /\b(bond|debenture|gold|mutual fund|equity)\b/i, group: 'Investments' },
  { pattern: /\bloan\b/i, group: 'Loans (Liability)' },
  { pattern: /\b(tax|stt|duty|duties)\b/i, group: 'Duties & Taxes' },
  { pattern: /\bcapital\b/i, group: 'Capital Account' },
  { pattern: /\breserves?\b/i, group: 'Reserves & Surplus' },
];

const TYPE_DEFAULTS: Record<AccountLike['type'], TallyReservedGroup> = {
  ASSET: 'Current Assets',
  LIABILITY: 'Current Liabilities',
  INCOME: 'Indirect Incomes',
  EXPENSE: 'Indirect Expenses',
  EQUITY: 'Capital Account',
};

export function resolveTallyParentGroup(account: AccountLike): TallyReservedGroup {
  const byCode = EXACT_CODE_OVERRIDES[account.code];
  if (byCode) return byCode;

  for (const { pattern, group } of NAME_HEURISTICS) {
    if (pattern.test(account.name)) return group;
  }

  return TYPE_DEFAULTS[account.type];
}
