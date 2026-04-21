export interface FormatOptions {
  fractionDigits?: number;
  showSymbol?: boolean;
  showSign?: boolean;
  compact?: boolean;
}

const INR = '\u20B9';

export function formatINR(
  value: number | string | null | undefined,
  opts: FormatOptions = {},
): string {
  if (value === null || value === undefined || value === '') return '-';
  const num = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(num)) return '-';

  const { fractionDigits = 2, showSymbol = true, showSign = false, compact = false } = opts;

  const sign = num < 0 ? '-' : showSign && num > 0 ? '+' : '';
  const abs = Math.abs(num);

  let body: string;
  if (compact) {
    body = compactIndian(abs, fractionDigits);
  } else {
    body = abs.toLocaleString('en-IN', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
  }

  return `${sign}${showSymbol ? INR : ''}${body}`;
}

export function compactIndian(absValue: number, fractionDigits = 2): string {
  const crore = 1_00_00_000;
  const lakh = 1_00_000;
  const thousand = 1_000;
  const toFixed = (v: number) => v.toFixed(fractionDigits).replace(/\.?0+$/, '');
  if (absValue >= crore) return `${toFixed(absValue / crore)} Cr`;
  if (absValue >= lakh) return `${toFixed(absValue / lakh)} L`;
  if (absValue >= thousand) return `${toFixed(absValue / thousand)} K`;
  return absValue.toLocaleString('en-IN', { maximumFractionDigits: fractionDigits });
}

export function formatPercent(
  value: number | null | undefined,
  fractionDigits = 2,
  showSign = false,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  const sign = value < 0 ? '-' : showSign && value > 0 ? '+' : '';
  return `${sign}${Math.abs(value).toFixed(fractionDigits)}%`;
}

export function formatQuantity(value: number | string | null | undefined, fractionDigits = 4): string {
  if (value === null || value === undefined || value === '') return '-';
  const num = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(num)) return '-';
  return num.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  });
}

export function signOf(value: number | null | undefined): 'positive' | 'negative' | 'zero' {
  if (value === null || value === undefined || value === 0) return 'zero';
  return value > 0 ? 'positive' : 'negative';
}
