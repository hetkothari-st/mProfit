import { Decimal, formatINR } from '@portfolioos/shared';

export interface CryptoNarrationMeta {
  exchange: string;
  network: string;
  walletAddress: string;
  narration: string;
}

/** Parse encoded crypto metadata from Transaction.narration. */
export function parseCryptoNarration(stored: string | null | undefined): CryptoNarrationMeta {
  const out: CryptoNarrationMeta = { exchange: '', network: '', walletAddress: '', narration: '' };
  if (!stored) return out;
  const leftover: string[] = [];
  for (const part of stored.split(' | ')) {
    if (part.startsWith('Exchange: ')) out.exchange = part.slice(10);
    else if (part.startsWith('Network: ')) out.network = part.slice(9);
    else if (part.startsWith('Wallet: ')) out.walletAddress = part.slice(8);
    else leftover.push(part);
  }
  out.narration = leftover.join(' | ');
  return out;
}

/** Encode crypto metadata into Transaction.narration. */
export function buildCryptoNarration(opts: {
  exchange?: string;
  network?: string;
  walletAddress?: string;
  narration?: string;
}): string | undefined {
  const parts: string[] = [];
  if (opts.exchange) parts.push(`Exchange: ${opts.exchange}`);
  if (opts.network) parts.push(`Network: ${opts.network}`);
  if (opts.walletAddress) parts.push(`Wallet: ${opts.walletAddress}`);
  if (opts.narration) parts.push(opts.narration);
  return parts.length > 0 ? parts.join(' | ') : undefined;
}

/** Format USD amount with thousands separators, preserving Decimal precision. */
export function formatUSD(amount: string | Decimal): string {
  const d = typeof amount === 'string' ? new Decimal(amount) : amount;
  const [whole, frac = ''] = d.toFixed(2).split('.');
  const withCommas = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${withCommas}.${frac.padEnd(2, '0')}`;
}

/** Format a money-string as INR using project conventions. */
export function formatMoneyInr(value: string | Decimal): string {
  return formatINR(typeof value === 'string' ? value : value.toString());
}
