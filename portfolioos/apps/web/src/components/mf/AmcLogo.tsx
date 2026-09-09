/**
 * A fund house's mark, wherever funds are listed.
 *
 * ---------------------------------------------------------------------------
 * WHY THE FALLBACK IS PART OF THE COMPONENT
 * ---------------------------------------------------------------------------
 *
 * 51 of the 52 houses with schemes in the database have a logo committed under
 * `public/amc`. The 52nd does not, and neither will the next AMC to launch
 * before anyone has fetched its mark. A component that assumed a file existed
 * would put a broken image in a list the reader is scanning — worse than no
 * logo, because a broken image reads as a broken page.
 *
 * So initials in a tinted disc are the floor: deterministic per house, stable
 * across renders, and obviously a placeholder rather than a guess at someone's
 * branding. `onError` catches the same case at runtime for a file that goes
 * missing after a deploy.
 *
 * ---------------------------------------------------------------------------
 * WHY THE IMAGES ARE COMMITTED RATHER THAN FETCHED
 * ---------------------------------------------------------------------------
 *
 * Pointing an <img> at a third-party logo service would put a request to
 * someone else's server on every fund page a reader opens, which tells that
 * service what funds this person is researching. It also breaks the page when
 * the service is down or ends its free tier, which Clearbit's did. Fetching
 * once at build time (`scripts/fetch-amc-logos.sh`) costs 200KB in the repo and
 * has none of that.
 */

import { useState } from 'react';

import { AMC_LOGOS } from '@/lib/amcLogos';

/**
 * The slug an AMC name maps to in `AMC_LOGOS`.
 *
 * Kept in step with the slug the fetch script writes: drop the "Mutual Fund"
 * suffix every one of them carries, then reduce to lowercase words joined by
 * hyphens. "Aditya Birla Sun Life Mutual Fund" and "ASK MUTUAL FUND" both land
 * on the files named for them.
 */
export function amcSlug(amcName: string): string {
  return amcName
    .replace(/\bmutual\s+fund\b/gi, ' ')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/**
 * Initials and a hue for the fallback.
 *
 * The hue is a hash of the full name, so two houses are rarely the same colour
 * and each is the same colour every time. Saturation and lightness are fixed so
 * none of them fight the lime accent.
 */
export function houseMark(amcName: string): { initials: string; hue: number } {
  const words = amcName
    .replace(/\b(mutual fund|asset management|amc|india|limited|ltd\.?|company|trustee)\b/gi, ' ')
    .replace(/[^A-Za-z ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const initials = (words[0]?.[0] ?? '?') + (words[1]?.[0] ?? '');
  let h = 0;
  for (let i = 0; i < amcName.length; i++) h = (h * 31 + amcName.charCodeAt(i)) % 360;
  return { initials: initials.toUpperCase(), hue: h };
}

export function AmcLogo({
  amcName,
  size = 40,
  className,
}: {
  amcName: string;
  /** Rendered square, in px. Logos are 128px, so anything up to that is crisp. */
  size?: number;
  className?: string;
}) {
  const src = AMC_LOGOS[amcSlug(amcName)];
  const [failed, setFailed] = useState(false);

  const box = `${className ?? ''} flex shrink-0 items-center justify-center overflow-hidden rounded-xl`;

  if (src !== undefined && !failed) {
    return (
      // White ground: most of these marks were drawn for paper and several are
      // dark ink with no light variant, which would vanish on this background.
      <span className={`${box} bg-white`} style={{ width: size, height: size, padding: size * 0.1 }}>
        <img
          src={src}
          alt={`${amcName} logo`}
          loading="lazy"
          decoding="async"
          // `contain`, never `cover`: these are wordmarks and roundels of wildly
          // different aspect ratios, and cropping one to fill a square is how a
          // logo stops looking like itself.
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  const { initials, hue } = houseMark(amcName);
  return (
    <span
      aria-hidden
      className={`${box} font-semibold tracking-tight`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.32)),
        backgroundColor: `hsl(${hue} 40% 22%)`,
        color: `hsl(${hue} 70% 78%)`,
      }}
    >
      {initials}
    </span>
  );
}
