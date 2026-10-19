import { Decimal } from 'decimal.js';
import type { PassbookTokens } from '../shared/pdfPassbookParser.js';
import type { ParseResult, PfCanonicalEventInput } from '../types.js';

interface ParseInput {
  userId: string;
  accountIdentifier: string;
  tokens: PassbookTokens;
}

// Row format (from tokenizer, whitespace-normalized):
//   dd-mm-yyyy  description  [amount]  balance
//   OR (with separate withdrawal/deposit columns):
//   dd-mm-yyyy  description  [withdrawal]  [deposit]  balance
//
// After tokenizePassbookPdf() collapses whitespace, columns are single-space
// separated. We use two patterns: 5-column (wd + dep) and 4-column (single amt).

const ROW_RE_5COL =
  /^(\d{2}-\d{2}-\d{4})\s+(.+?)\s+([\d,]*\.?\d*)\s+([\d,]*\.?\d*)\s+([\d,]+\.\d{2})$/;

const ROW_RE_4COL =
  /^(\d{2}-\d{2}-\d{4})\s+(.+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/;

const TYPE_RULES: Array<{ test: RegExp; type: string }> = [
  { test: /OPENING\s+BAL/i,           type: 'PF_OPENING_BALANCE' },
  { test: /INTEREST/i,                 type: 'PF_INTEREST_CREDIT' },
  { test: /WITHDRAW/i,                 type: 'PF_WITHDRAWAL' },
  { test: /TRANSFER\s+IN/i,            type: 'PF_TRANSFER_IN' },
  { test: /TRANSFER\s+OUT/i,           type: 'PF_TRANSFER_OUT' },
  { test: /DEPOSIT|CONTRIBUT|PPF\s+D/i, type: 'PF_EMPLOYEE_CONTRIBUTION' },
];

function classify(desc: string): string | undefined {
  for (const r of TYPE_RULES) if (r.test.test(desc)) return r.type;
  return undefined;
}

function toIsoDate(ddmmyyyy: string): string {
  const [d, m, y] = ddmmyyyy.split('-');
  return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
}

function toDecimalStr(raw: string): string {
  const cleaned = raw.replace(/,/g, '').trim();
  if (!cleaned || cleaned === '.') return '0.00';
  return new Decimal(cleaned).toFixed(2);
}

export function parseSbiPpfPassbook(input: ParseInput): ParseResult<PfCanonicalEventInput> {
  const events: PfCanonicalEventInput[] = [];
  const seq = new Map<string, number>();

  for (const line of input.tokens.lines) {
    let dateRaw: string | undefined;
    let descRaw: string | undefined;
    let amount: string;

    // Try 5-column format first (explicit withdrawal + deposit columns)
    const m5 = line.match(ROW_RE_5COL);
    if (m5) {
      [, dateRaw, descRaw] = m5;
      const wd = toDecimalStr(m5[3] ?? '0');
      const dep = toDecimalStr(m5[4] ?? '0');
      const type5 = classify(descRaw ?? '');
      if (!type5) continue;
      amount = type5 === 'PF_WITHDRAWAL' ? wd : dep !== '0.00' ? dep : wd;
      if (amount === '0.00') continue;
      const eventDate = toIsoDate(dateRaw ?? '');
      const bucket = `${eventDate}|${type5}|${amount}`;
      const seqIdx = seq.get(bucket) ?? 0;
      seq.set(bucket, seqIdx + 1);
      events.push({ type: type5, eventDate, amount, memberIdLast4: input.accountIdentifier.slice(-4), notes: (descRaw ?? '').trim(), sequence: seqIdx });
      continue;
    }

    // Try 4-column format (single amount column, no separate wd/dep)
    const m4 = line.match(ROW_RE_4COL);
    if (!m4) continue;
    [, dateRaw, descRaw] = m4;
    // m4[3] = amount, m4[4] = running balance — we want the transaction amount
    amount = toDecimalStr(m4[3] ?? '0');
    const type = classify(descRaw ?? '');
    if (!type) continue;
    if (amount === '0.00') continue;
    const eventDate = toIsoDate(dateRaw ?? '');
    const bucket = `${eventDate}|${type}|${amount}`;
    const seqIdx = seq.get(bucket) ?? 0;
    seq.set(bucket, seqIdx + 1);
    events.push({
      type,
      eventDate,
      amount,
      memberIdLast4: input.accountIdentifier.slice(-4),
      notes: (descRaw ?? '').trim(),
      sequence: seqIdx,
    });
  }

  if (events.length === 0) return { ok: false, error: 'No recognizable rows' };
  return { ok: true, events };
}
