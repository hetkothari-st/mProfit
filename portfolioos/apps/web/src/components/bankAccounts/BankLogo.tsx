/**
 * A bank's mark, wherever a bank is shown: account tiles, FD/RD cards.
 *
 * The logo files are committed under `public/banks` (see
 * scripts/fetch-bank-logos.py for why they're self-hosted). A bank without a
 * file — or whose file fails to load after a deploy — renders initials on its
 * brand colour instead: obviously a placeholder, never a broken image.
 */
import { useEffect, useState } from 'react';
import { bankBrandFor, tileSurface } from '@/lib/bankBrand';

/** "HDFC Bank" → "HD", "Nowhere Co-op Bank" → "NC". */
function bankInitials(name: string): string {
  const words = name
    .replace(/\b(bank|of|the|ltd|limited)\b/gi, ' ')
    .split(/[\s\-.&]+/)
    .filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return (words[0] ?? name).slice(0, 2).toUpperCase() || '₹';
}

export function BankLogo({
  bankName,
  size = 40,
  className,
}: {
  /** Any label naming the bank: "HDFC Bank", "SBI", "HDFC FD 2025". */
  bankName: string;
  /** Rendered square, in px. Files are ≤128px, so anything up to that is crisp. */
  size?: number;
  className?: string;
}) {
  const brand = bankBrandFor(bankName);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [brand?.logo]);

  const box = `${className ?? ''} flex shrink-0 items-center justify-center overflow-hidden rounded-lg`;

  if (brand?.logo && !failed) {
    return (
      // White chip: most marks are drawn for paper, and several are dark ink
      // with no light variant, which would vanish on a coloured tile.
      <span
        className={`${box} bg-white ring-1 ring-black/5`}
        style={{ width: size, height: size, padding: Math.round(size * 0.12) }}
      >
        <img
          src={brand.logo}
          alt={`${brand.name} logo`}
          loading="lazy"
          decoding="async"
          // `contain`, never `cover`: wordmarks and roundels of every aspect
          // ratio; cropping one to a square is how a logo stops looking like itself.
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={`${box} font-semibold tracking-tight text-white`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.34)),
        background: brand?.color ? tileSurface(brand.color, brand.accent).via : 'hsl(215 16% 35%)',
      }}
    >
      {bankInitials(brand?.name ?? bankName)}
    </span>
  );
}
