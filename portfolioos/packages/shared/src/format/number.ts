import { Decimal, toDecimal } from '../decimal.js';

export interface FormatOptions {
  fractionDigits?: number;
  showSymbol?: boolean;
  showSign?: boolean;
  compact?: boolean;
}

const INR = '₹';

// Money values arrive as strings at the boundary (§3.2). Parse through Decimal
// so the displayed rupee/paise split is exact — a 4dp string like "33.3300"
// round-tripped through JS Number would sometimes format as "33.32" on sum.
function tryDecimal(value: number | string | null | undefined): Decimal | null {
  if (value === null || value === undefined || value === '') return null;
  try {
    const d = toDecimal(value);
    if (!d.isFinite()) return null;
    return d;
  } catch {
    return null;
  }
}

function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
}

function formatDecimalEnIn(abs: Decimal, fractionDigits: number): string {
  const fixed = abs.toFixed(fractionDigits, Decimal.ROUND_HALF_EVEN);
  const [intPart, fracPart] = fixed.split('.');
  const grouped = groupIndian(intPart!);
  return fracPart ? `${grouped}.${fracPart}` : grouped;
}

export function formatINR(
  value: number | string | null | undefined,
  opts: FormatOptions = {},
): string {
  const d = tryDecimal(value);
  if (!d) return '-';

  const { fractionDigits = 2, showSymbol = true, showSign = false, compact = false } = opts;

  const sign = d.isNegative() ? '-' : showSign && d.greaterThan(0) ? '+' : '';
  const abs = d.abs();

  const body = compact
    ? compactIndianDecimal(abs, fractionDigits)
    : formatDecimalEnIn(abs, fractionDigits);
  return `${sign}${showSymbol ? INR : ''}${body}`;
}

function compactIndianDecimal(abs: Decimal, fractionDigits: number): string {
  const crore = new Decimal(1_00_00_000);
  const lakh = new Decimal(1_00_000);
  const thousand = new Decimal(1_000);
  const toFixed = (v: Decimal) =>
    v.toFixed(fractionDigits, Decimal.ROUND_HALF_EVEN).replace(/\.?0+$/, '');
  if (abs.greaterThanOrEqualTo(crore)) return `${toFixed(abs.dividedBy(crore))} Cr`;
  if (abs.greaterThanOrEqualTo(lakh)) return `${toFixed(abs.dividedBy(lakh))} L`;
  if (abs.greaterThanOrEqualTo(thousand)) return `${toFixed(abs.dividedBy(thousand))} K`;
  return formatDecimalEnIn(abs, fractionDigits).replace(/\.?0+$/, (m) =>
    m.includes('.') ? '' : m,
  );
}

// Back-compat shim for any caller that still passes a JS number — route
// through Decimal so no float drift sneaks into the formatted output.
export function compactIndian(absValue: number | string, fractionDigits = 2): string {
  const d = tryDecimal(absValue) ?? new Decimal(0);
  return compactIndianDecimal(d.abs(), fractionDigits);
}

// Percent is dimensionless — JS number is fine for display; the caller is
// responsible for computing the ratio in Decimal up to the point of rendering.
export function formatPercent(
  value: number | null | undefined,
  fractionDigits = 2,
  showSign = false,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  const sign = value < 0 ? '-' : showSign && value > 0 ? '+' : '';
  return `${sign}${Math.abs(value).toFixed(fractionDigits)}%`;
}

export function formatQuantity(
  value: number | string | null | undefined,
  fractionDigits = 4,
): string {
  const d = tryDecimal(value);
  if (!d) return '-';
  const fixed = d.abs().toFixed(fractionDigits, Decimal.ROUND_HALF_EVEN);
  const [intPart, fracPart] = fixed.split('.');
  const grouped = groupIndian(intPart!);
  const signed = d.isNegative() ? '-' + grouped : grouped;
  if (!fracPart) return signed;
  const trimmed = fracPart.replace(/0+$/, '');
  return trimmed ? `${signed}.${trimmed}` : signed;
}

export function signOf(
  value: number | string | null | undefined,
): 'positive' | 'negative' | 'zero' {
  const d = tryDecimal(value);
  if (!d || d.isZero()) return 'zero';
  return d.isNegative() ? 'negative' : 'positive';
}
