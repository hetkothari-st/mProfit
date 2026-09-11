/**
 * A bank's mark, wherever a bank is shown: account tiles, FD/RD cards.
 *
 * The logo files are committed under `public/banks` (see
 * scripts/fetch-bank-logos.py for why they're self-hosted). A bank without a
 * file — or whose file fails to load after a deploy — renders initials on its
 * brand colour instead: obviously a placeholder, never a broken image.
 *
 * The white plate takes the mark's own shape: square for an icon, wide for a
 * wordmark like "HDFC BANK". Squeezing a 5:1 wordmark into a square leaves it a
 * few pixels tall — unreadable, which is why `size` is the plate's height and
 * its width follows the mark's recorded aspect ratio.
 */
import { useEffect, useState } from 'react';
import { bankBrandFor, tileSurface, type BankBrand } from '@/lib/bankBrand';

/** "HDFC Bank" → "HD", "Nowhere Co-op Bank" → "NC". */
function bankInitials(name: string): string {
  const words = name
    .replace(/\b(bank|of|the|ltd|limited)\b/gi, ' ')
    .split(/[\s\-.&]+/)
    .filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return (words[0] ?? name).slice(0, 2).toUpperCase() || '₹';
}

/**
 * Any brand's mark on its plate — banks here, insurers in InsurerLogo. Falls
 * back to `initials` on the brand colour (or `fallbackColor`).
 */
export function BrandLogo({
  brand,
  initials,
  fallbackColor = 'hsl(215 16% 35%)',
  size = 40,
  maxWidth,
  className,
}: {
  brand: BankBrand | null;
  initials: string;
  fallbackColor?: string;
  /** Plate height in px; width follows the mark's shape. */
  size?: number;
  /** Cap for wide wordmarks (default 5× the height). */
  maxWidth?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [brand?.logo]);

  if (brand?.logo && !failed) {
    const pad = Math.round(size * 0.15);
    const natural = Math.round((size - 2 * pad) * brand.aspect + 2 * pad);
    const width = Math.max(size, Math.min(natural, maxWidth ?? size * 5));
    return (
      // White plate: most marks are drawn for paper, and several are dark ink
      // with no light variant, which would vanish on a coloured tile.
      <span
        className={`${className ?? ''} inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-white ring-1 ring-black/5`}
        style={{ width, height: size, padding: pad }}
      >
        <img
          src={brand.logo}
          alt={`${brand.name} logo`}
          loading="lazy"
          decoding="async"
          // `contain`, never `cover`: cropping a mark to fit is how a logo stops
          // looking like itself.
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={`${className ?? ''} flex shrink-0 items-center justify-center overflow-hidden rounded-lg font-semibold tracking-tight text-white`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.34)),
        background: brand?.color ? tileSurface(brand.color, brand.accent).via : fallbackColor,
      }}
    >
      {initials}
    </span>
  );
}

export function BankLogo({
  bankName,
  size = 40,
  maxWidth,
  className,
}: {
  /** Any label naming the bank: "HDFC Bank", "SBI", "HDFC FD 2025". */
  bankName: string;
  /** Plate height in px; width follows the mark's shape. */
  size?: number;
  /** Cap for wide wordmarks (default 5× the height). */
  maxWidth?: number;
  className?: string;
}) {
  const brand = bankBrandFor(bankName);
  return (
    <BrandLogo
      brand={brand}
      initials={bankInitials(brand?.name ?? bankName)}
      size={size}
      maxWidth={maxWidth}
      className={className}
    />
  );
}
