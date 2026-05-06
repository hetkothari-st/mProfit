import { Decimal } from 'decimal.js';
import type { PassbookTokens } from '../shared/pdfPassbookParser.js';
import type { ParseResult, PfCanonicalEventInput } from '../types.js';

interface ParseInput {
  userId: string;
  memberId: string;
  tokens: PassbookTokens;
}

// EPFO passbook table row — conservative regex matching the synthetic fixture
// and common real EPFO formats:
//   Apr-2024   01-04-2024   CR EMPLOYER SHARE   5000.00   105000.00
const ROW_RE =
  /^(\w{3}-\d{4})\s+(\d{2}-\d{2}-\d{4})\s+((?:[A-Z0-9/().]+\s*)+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/i;

const TYPE_RULES: Array<{ test: RegExp; type: string }> = [
  { test: /EMPLOYER\s+SHARE/i, type: 'PF_EMPLOYER_CONTRIBUTION' },
  { test: /EMPLOYEE\s+SHARE/i, type: 'PF_EMPLOYEE_CONTRIBUTION' },
  { test: /\bVPF\b/i, type: 'PF_VPF_CONTRIBUTION' },
  { test: /INTEREST/i, type: 'PF_INTEREST_CREDIT' },
  { test: /WITHDRAW/i, type: 'PF_WITHDRAWAL' },
  { test: /TRANSFER\s+IN/i, type: 'PF_TRANSFER_IN' },
  { test: /TRANSFER\s+OUT/i, type: 'PF_TRANSFER_OUT' },
  { test: /OPENING\s+BAL/i, type: 'PF_OPENING_BALANCE' },
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
  return new Decimal(raw.replace(/,/g, '')).toFixed(2);
}

export function parseEpfoPassbook(input: ParseInput): ParseResult<PfCanonicalEventInput> {
  const events: PfCanonicalEventInput[] = [];
  const seqMap = new Map<string, number>();

  for (const line of input.tokens.lines) {
    const m = line.match(ROW_RE);
    if (!m) continue;
    const [, , dateRaw, descRaw, amtRaw] = m;
    const type = classify(descRaw ?? '');
    if (!type) continue;
    const eventDate = toIsoDate(dateRaw ?? '');
    const amount = toDecimalStr(amtRaw ?? '0');
    const bucket = `${eventDate}|${type}|${amount}`;
    const seq = seqMap.get(bucket) ?? 0;
    seqMap.set(bucket, seq + 1);
    events.push({
      type,
      eventDate,
      amount,
      memberIdLast4: input.memberId.slice(-4),
      notes: (descRaw ?? '').trim(),
      sequence: seq,
    });
  }

  if (events.length === 0) return { ok: false, error: 'No recognizable rows parsed' };
  return { ok: true, events };
}
