import { formatDistanceToNow } from 'date-fns';

/**
 * Price-freshness indicator. Shows when the market quote behind a holding's
 * value was captured; turns amber with a ⚠ when the quote is stale (older than
 * its asset class tolerance — see api/services/priceStaleness.ts). Renders
 * nothing for assets with no market price (priceAsOf null).
 */
export function PriceAsOf({ asOf, stale }: { asOf?: string | null; stale?: boolean }) {
  if (!asOf) return null;
  return (
    <span
      title={`Price as of ${new Date(asOf).toLocaleString()}`}
      className={`text-[10px] ${stale ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}
    >
      {stale ? '⚠ ' : ''}as of {formatDistanceToNow(new Date(asOf), { addSuffix: true })}
    </span>
  );
}
