/**
 * A credit card drawn as the real card: the product's own colourway and finish
 * (see data/creditCardCatalog), the issuer's logo printed in one ink the way
 * banks print it on plastic and metal, the EMV chip, the network's mark, and
 * the holder's name.
 *
 * Every measurement is in `cqw` (a percentage of the card's own width), so the
 * card scales like a physical object — the same proportions in a list tile and
 * on the detail page. Vertical cards (Swiggy, Tata Neu, Scapia…) stand upright.
 */
import { useEffect, useId, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { creditCardsApi, type CreditCardDTO } from '@/api/creditCards.api';
import type { CardDesign, CardNetwork, CardPattern, CardTier } from '@/data/creditCardCatalog';
import { bankBrandFor } from '@/lib/bankBrand';
import { resolveCardDesign } from '@/lib/creditCardDesign';
import { useAuthStore } from '@/stores/auth.store';

const INK = {
  light: { text: '#f7f7f5', muted: 'rgba(255,255,255,0.66)', shadow: '0 1px 1px rgba(0,0,0,0.45)' },
  dark: { text: '#1d1b19', muted: 'rgba(29,27,25,0.62)', shadow: '0 1px 0 rgba(255,255,255,0.45)' },
} as const;

/** Tiers whose product names are set in the display serif, as premium cards are. */
const SERIF_TIERS = new Set<CardTier>(['metal', 'infinite', 'black', 'world', 'signature']);

/** Short names for issuers whose mark is an emblem rather than a wordmark. */
const ISSUER_SHORT: Record<string, string> = {
  'State Bank of India': 'SBI Card',
  'Bank of Baroda': 'BOBCARD',
  'Axis Bank': 'AXIS BANK',
  'AU Small Finance Bank': 'AU Bank',
  'Yes Bank': 'YES BANK',
  'Standard Chartered Bank': 'Standard Chartered',
  'Kotak Mahindra Bank': 'kotak',
};

// ── Surface ───────────────────────────────────────────────────────────────────

const FINISH: Record<CardDesign['finish'], CSSProperties[]> = {
  metal: [
    // Brushed grain, then a band of light across it.
    { background: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0 1px, rgba(0,0,0,0.04) 1px 2px, transparent 2px 3px)' },
    { background: 'linear-gradient(112deg, transparent 28%, rgba(255,255,255,0.22) 44%, transparent 58%)' },
  ],
  glossy: [
    { background: 'radial-gradient(120% 85% at 8% 0%, rgba(255,255,255,0.30), transparent 55%)' },
  ],
  matte: [
    { background: 'linear-gradient(180deg, rgba(255,255,255,0.07), transparent 38%)' },
  ],
  pearl: [
    {
      background:
        'linear-gradient(118deg, rgba(255,205,250,0.26), rgba(185,240,255,0.16) 38%, rgba(255,242,195,0.22) 68%, transparent)',
      mixBlendMode: 'soft-light',
    },
    { background: 'radial-gradient(110% 80% at 12% 0%, rgba(255,255,255,0.22), transparent 55%)' },
  ],
};

function Pattern({ kind, color, vertical, uid }: { kind: CardPattern; color: string; vertical: boolean; uid: string }) {
  if (kind === 'none') return null;
  const W = vertical ? 63 : 100;
  const H = vertical ? 100 : 63;
  let body: ReactNode = null;
  switch (kind) {
    case 'waves':
      body = Array.from({ length: 7 }, (_, i) => {
        const y = H * 0.5 + i * 5;
        return <path key={i} d={`M-5 ${y} Q ${W * 0.25} ${y - 9} ${W * 0.5} ${y} T ${W + 5} ${y}`} />;
      });
      break;
    case 'lines':
      body = Array.from({ length: Math.ceil((W + H) / 1.6) }, (_, i) => {
        const x = -H + i * 1.6;
        return <path key={i} d={`M${x} 0 L${x + H} ${H}`} strokeWidth={0.18} />;
      });
      break;
    case 'circles':
      body = Array.from({ length: 11 }, (_, i) => <circle key={i} cx={W * 0.88} cy={H * 0.92} r={8 + i * 7} />);
      break;
    case 'topo':
      body = Array.from({ length: 9 }, (_, i) => (
        <ellipse
          key={i}
          cx={W * 0.78}
          cy={H * 0.28}
          rx={6 + i * 6.5}
          ry={4 + i * 4.4}
          transform={`rotate(${-18 + i * 3} ${W * 0.78} ${H * 0.28})`}
        />
      ));
      break;
    case 'mountains':
      body = (
        <g stroke="none" fill={color}>
          <path d={`M0 ${H} L0 ${H * 0.72} L${W * 0.22} ${H * 0.5} L${W * 0.4} ${H * 0.66} L${W * 0.62} ${H * 0.42} L${W} ${H * 0.7} L${W} ${H} Z`} opacity={0.55} />
          <path d={`M0 ${H} L0 ${H * 0.86} L${W * 0.3} ${H * 0.68} L${W * 0.55} ${H * 0.82} L${W * 0.8} ${H * 0.62} L${W} ${H * 0.78} L${W} ${H} Z`} />
        </g>
      );
      break;
    case 'hex':
    case 'dots':
      body = (
        <>
          <defs>
            {kind === 'hex' ? (
              <pattern id={`${uid}-p`} width={6} height={10.39} patternUnits="userSpaceOnUse">
                <path d="M3 0 L6 1.73 L6 5.2 L3 6.93 L0 5.2 L0 1.73 Z M3 6.93 L3 10.39" strokeWidth={0.2} />
              </pattern>
            ) : (
              <pattern id={`${uid}-p`} width={2.6} height={2.6} patternUnits="userSpaceOnUse">
                <circle cx={1.3} cy={1.3} r={0.42} fill={color} stroke="none" />
              </pattern>
            )}
          </defs>
          <rect width={W} height={H} fill={`url(#${uid}-p)`} stroke="none" />
        </>
      );
      break;
    case 'shapes':
      body = (
        <g stroke="none" fill={color}>
          <circle cx={W * 0.95} cy={H * 0.05} r={H * 0.55} />
          <circle cx={W * 0.72} cy={H * 1.05} r={H * 0.42} />
          <circle cx={W * 0.08} cy={H * 0.98} r={H * 0.22} />
        </g>
      );
      break;
  }
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      stroke={color}
      strokeWidth={0.3}
    >
      {body}
    </svg>
  );
}

// ── Hardware ──────────────────────────────────────────────────────────────────

function Chip({ tone, vertical }: { tone: 'gold' | 'silver'; vertical: boolean }) {
  const [a, b, c] = tone === 'gold' ? ['#f6e3a1', '#d4ad57', '#a8802f'] : ['#f2f4f6', '#c3c8cf', '#8c939c'];
  const id = useId().replace(/:/g, '');
  return (
    <svg
      aria-hidden
      viewBox="0 0 50 38"
      style={{ width: vertical ? '17cqw' : '12.5cqw', transform: vertical ? 'rotate(90deg)' : undefined }}
    >
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="0.5" stopColor={b} />
          <stop offset="1" stopColor={c} />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="49" height="37" rx="6" fill={`url(#${id}-g)`} stroke="rgba(0,0,0,0.25)" />
      <g fill="none" stroke="rgba(60,40,10,0.45)" strokeWidth="1">
        <path d="M0 13 H16 M0 25 H16 M34 13 H50 M34 25 H50" />
        <path d="M16 6 H34 V32 H16 Z" />
        <path d="M25 0 V6 M25 32 V38 M16 19 H34" />
      </g>
    </svg>
  );
}

function Contactless({ color, width }: { color: string; width: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" style={{ width }} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
      <path d="M8.5 7.5a6 6 0 0 1 0 9" opacity={0.9} />
      <path d="M12 5a9.5 9.5 0 0 1 0 14" opacity={0.9} />
      <path d="M15.5 2.5a13 13 0 0 1 0 19" opacity={0.9} />
      <path d="M5 10a2.5 2.5 0 0 1 0 4" opacity={0.9} />
    </svg>
  );
}

function NetworkMark({ network, ink, width }: { network: CardNetwork | null; ink: 'light' | 'dark'; width: string }) {
  const uid = useId().replace(/:/g, '');
  if (!network) return null;
  const color = ink === 'light' ? '#ffffff' : '#1a1f71';
  switch (network) {
    case 'VISA':
      return (
        <span
          role="img"
          aria-label="Visa"
          className="font-black italic leading-none tracking-tight"
          style={{ fontSize: `calc(${width} * 0.42)`, color, fontFamily: 'Arial Black, Arial, sans-serif' }}
        >
          <span aria-hidden>VISA</span>
        </span>
      );
    case 'MASTERCARD':
      return (
        <svg role="img" aria-label="Mastercard" viewBox="0 0 38 24" style={{ width }}>
          <defs>
            <clipPath id={`${uid}-mc`}>
              <circle cx="12" cy="12" r="11" />
            </clipPath>
          </defs>
          <circle cx="12" cy="12" r="11" fill="#eb001b" />
          <circle cx="26" cy="12" r="11" fill="#f79e1b" />
          <circle cx="26" cy="12" r="11" fill="#ff5f00" clipPath={`url(#${uid}-mc)`} />
        </svg>
      );
    case 'AMEX':
      return (
        <svg role="img" aria-label="American Express" viewBox="0 0 40 40" style={{ width: `calc(${width} * 0.8)` }}>
          <rect width="40" height="40" rx="3" fill="#016fd0" />
          <g fill="#fff" fontFamily="Arial Narrow, Arial, sans-serif" fontWeight="900" textAnchor="middle">
            <text x="20" y="18.5" fontSize="8" textLength="34" lengthAdjust="spacingAndGlyphs">AMERICAN</text>
            <text x="20" y="28" fontSize="8" textLength="30" lengthAdjust="spacingAndGlyphs">EXPRESS</text>
          </g>
        </svg>
      );
    case 'RUPAY':
      return (
        <svg role="img" aria-label="RuPay" viewBox="0 0 64 20" style={{ width }}>
          <text x="0" y="16" fontSize="17" fontWeight="900" fontStyle="italic" fontFamily="Arial, sans-serif" fill={color} textLength="46" lengthAdjust="spacingAndGlyphs">
            RuPay
          </text>
          <path d="M53 3 L63 10 L51 17 Z" fill="#f47920" />
          <path d="M50 3 L57 10 L48 17 Z" fill="#1b9e4b" />
        </svg>
      );
    case 'DINERS':
      return (
        <svg role="img" aria-label="Diners Club" viewBox="0 0 30 24" style={{ width: `calc(${width} * 0.8)` }}>
          <circle cx="15" cy="12" r="11.5" fill="#0079be" />
          <path d="M13 5.5 A7 7 0 0 0 13 18.5 Z M17 5.5 A7 7 0 0 1 17 18.5 Z" fill="#fff" />
        </svg>
      );
  }
}

/**
 * The issuer's logo in a single ink. The SVG filter keeps the mark's shape and
 * drops its white ground: alpha falls with brightness, so white plates vanish
 * and coloured ink turns into white foil (or dark print on a light card).
 */
function IssuerMark({
  issuer,
  ink,
  height,
  maxWidth,
  filterId,
}: {
  issuer: string;
  ink: 'light' | 'dark';
  height: string;
  maxWidth: string;
  filterId: string;
}) {
  const brand = bankBrandFor(issuer);
  const [failed, setFailed] = useState(false);
  const color = INK[ink].text;

  if (issuer === 'American Express') {
    return (
      <span className="font-display font-semibold uppercase leading-none" style={{ fontSize: `calc(${height} * 0.5)`, letterSpacing: '0.16em', color }}>
        American Express
      </span>
    );
  }
  const name = ISSUER_SHORT[issuer] ?? brand?.name ?? issuer;
  const wordmarkOnly = brand?.logo && !failed && brand.aspect >= 1.8;
  return (
    <span className="flex min-w-0 items-center" style={{ gap: `calc(${height} * 0.3)` }}>
      {brand?.logo && !failed && (
        <img
          src={brand.logo}
          alt={`${brand.name} logo`}
          className="shrink-0 object-contain object-left"
          style={{ height, maxWidth, filter: `url(#${filterId})` }}
          onError={() => setFailed(true)}
        />
      )}
      {!wordmarkOnly && (
        <span className="truncate font-bold leading-none" style={{ fontSize: `calc(${height} * 0.55)`, color }}>
          {name}
        </span>
      )}
    </span>
  );
}

function InkFilter({ id, ink }: { id: string; ink: 'light' | 'dark' }) {
  // RGB → the ink colour; alpha → 1.7 × (alpha − luminance), clamped.
  const v = ink === 'light' ? 1 : 0.11;
  const k = 1.7;
  const matrix = [
    `0 0 0 0 ${v}`,
    `0 0 0 0 ${v}`,
    `0 0 0 0 ${v}`,
    `${-0.2126 * k} ${-0.7152 * k} ${-0.0722 * k} ${k} 0`,
  ].join(' ');
  return (
    <svg aria-hidden width="0" height="0" className="absolute">
      <filter id={id} colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values={matrix} />
      </filter>
    </svg>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

/** Masked groups before the last four: Amex numbers are 15 digits in 4-6-5. */
function maskedGroups(network: CardNetwork | null): { groups: string[]; lead: string } {
  return network === 'AMEX' ? { groups: ['••••', '••••••'], lead: '•' } : { groups: ['••••', '••••', '••••'], lead: '' };
}

/** "4111111111111111" → "4111 1111 1111 1111"; Amex "378282246310005" → "3782 822463 10005". */
function groupCardNumber(n: string, network: CardNetwork | null): string {
  if (network === 'AMEX' && n.length === 15) return `${n.slice(0, 4)} ${n.slice(4, 10)} ${n.slice(10)}`;
  return n.replace(/(.{4})(?=.)/g, '$1 ');
}

const NOT_SAVED_MSG = 'Only the last 4 digits are saved. Edit the card to add the full number.';

export function CreditCardVisual({
  card,
  size = 'md',
  revealable = false,
}: {
  card: CreditCardDTO;
  size?: 'md' | 'lg';
  /** Show the eye button that reveals the full number (list tile, detail page). */
  revealable?: boolean;
}) {
  const holder = useAuthStore((s) => s.user?.name ?? '');
  // The full number is fetched on demand from the audited endpoint and held
  // only here — never in the react-query cache — and re-masked when the card
  // changes so a stale plaintext never outlives the card it came from.
  const [fullNumber, setFullNumber] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  useEffect(() => setFullNumber(null), [card.id, card.last4, card.hasCardNumber]);

  async function toggleReveal(e: MouseEvent<HTMLButtonElement>) {
    // The list page wraps the card in a <Link>; keep this click local.
    e.preventDefault();
    e.stopPropagation();
    if (fullNumber) {
      setFullNumber(null);
      return;
    }
    if (!card.hasCardNumber) {
      toast(NOT_SAVED_MSG);
      return;
    }
    setRevealing(true);
    try {
      const { cardNumber } = await creditCardsApi.revealCardNumber(card.id);
      if (cardNumber) setFullNumber(cardNumber);
      else toast(NOT_SAVED_MSG);
    } catch {
      toast.error('Could not reveal the card number. Try again in a minute.');
    } finally {
      setRevealing(false);
    }
  }

  const uid = useId().replace(/:/g, '');
  const r = resolveCardDesign(card);
  const { design } = r;
  const vertical = design.orientation === 'vertical';
  const ink = INK[design.ink];
  const productColor = design.accent ?? ink.text;
  const filterId = `${uid}-ink`;
  const { groups, lead } = maskedGroups(r.network);

  const product = (
    <span
      className={`${SERIF_TIERS.has(r.tier) ? 'font-display font-medium' : 'font-semibold'} block truncate leading-tight`}
      style={{ color: productColor, fontSize: vertical ? '8.6cqw' : '4.1cqw', letterSpacing: '0.03em', textShadow: ink.shadow }}
    >
      {r.product}
    </span>
  );
  const holderName = holder && (
    <span
      className="block truncate font-medium uppercase leading-none"
      style={{ color: ink.text, fontSize: vertical ? '5.8cqw' : '3.3cqw', letterSpacing: '0.12em', textShadow: ink.shadow }}
    >
      {holder.toUpperCase()}
    </span>
  );
  const revealLabel = fullNumber ? 'Hide card number' : 'Show card number';
  const iconSize = vertical ? '6.4cqw' : '3.8cqw';
  const eye = revealable && (
    <button
      type="button"
      onClick={toggleReveal}
      disabled={revealing}
      aria-label={revealLabel}
      aria-pressed={fullNumber !== null}
      title={revealLabel}
      className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-60"
      style={{
        color: ink.text,
        padding: vertical ? '1.8cqw' : '1.2cqw',
        background: design.ink === 'light' ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)',
      }}
    >
      {revealing ? (
        <Loader2 className="animate-spin" style={{ width: iconSize, height: iconSize }} />
      ) : fullNumber ? (
        <EyeOff style={{ width: iconSize, height: iconSize }} />
      ) : (
        <Eye style={{ width: iconSize, height: iconSize }} />
      )}
    </button>
  );
  const digits = fullNumber ? (
    <span className="select-text whitespace-nowrap" style={{ letterSpacing: '0.08em' }}>
      {groupCardNumber(fullNumber, r.network)}
    </span>
  ) : (
    <>
      {!vertical && groups.map((g, i) => <span key={i} style={{ color: ink.muted }}>{g}</span>)}
      <span className="flex">
        {vertical ? <span style={{ color: ink.muted, marginRight: '0.4em' }}>••••</span> : lead && <span style={{ color: ink.muted }}>{lead}</span>}
        <span>{card.last4}</span>
      </span>
    </>
  );
  const number = (
    <span className="flex items-center" style={{ gap: vertical ? '3cqw' : '2.5cqw' }}>
      <span
        className="flex items-baseline font-mono leading-none"
        style={{
          color: ink.text,
          // A revealed number is longer than the masked one; on an upright
          // card it has to fit the short side.
          fontSize: vertical ? (fullNumber ? '5.4cqw' : '7.2cqw') : '5cqw',
          gap: '0.55em',
          letterSpacing: '0.12em',
          textShadow: ink.shadow,
        }}
      >
        {digits}
      </span>
      {eye}
    </span>
  );

  return (
    <div className="relative flex aspect-[1.586/1] w-full items-center justify-center">
      <div
        data-testid="credit-card-face"
        data-card={r.designKey}
        data-finish={design.finish}
        data-orientation={design.orientation}
        className={`relative h-full overflow-hidden ${vertical ? 'aspect-[1/1.586]' : 'w-full'} ${
          card.status !== 'ACTIVE' ? 'opacity-70 grayscale' : ''
        }`}
        style={{
          containerType: 'inline-size',
          // A card's corner is the same radius on both sides, so as percentages
          // of an 85.6 × 54 mm card it differs per axis (and swaps upright).
          borderRadius: vertical ? '7.1% / 4.5%' : '4.5% / 7.1%',
          background: design.background,
          boxShadow: `inset 0 0 0 1px rgba(255,255,255,${design.ink === 'light' ? 0.1 : 0.45}), 0 ${
            size === 'lg' ? '18px 40px' : '12px 28px'
          } -14px rgba(0,0,0,0.65)`,
        }}
      >
        <InkFilter id={filterId} ink={design.ink} />
        <Pattern kind={design.pattern} color={design.patternColor ?? 'rgba(255,255,255,0.12)'} vertical={vertical} uid={uid} />
        {FINISH[design.finish].map((style, i) => (
          <div key={i} aria-hidden className="pointer-events-none absolute inset-0" style={style} />
        ))}

        {vertical ? (
          <div className="relative flex h-full flex-col" style={{ padding: '8cqw 7.5cqw' }}>
            <div className="flex items-start justify-between" style={{ gap: '4cqw' }}>
              <IssuerMark issuer={r.issuer} ink={design.ink} height="11cqw" maxWidth="66cqw" filterId={filterId} />
              <Contactless color={ink.text} width="8cqw" />
            </div>
            <div style={{ marginTop: '12cqw', marginLeft: '-2cqw' }}>
              <Chip tone={design.chip} vertical />
            </div>
            <div className="mt-auto" style={{ marginBottom: '6cqw' }}>{product}</div>
            <div className="flex items-end justify-between" style={{ gap: '4cqw' }}>
              <div className="flex min-w-0 flex-col" style={{ gap: '3cqw' }}>
                {number}
                {holderName}
              </div>
              <NetworkMark network={r.network} ink={design.ink} width="24cqw" />
            </div>
          </div>
        ) : (
          <div className="relative flex h-full flex-col" style={{ padding: '5.5cqw 6cqw' }}>
            <div className="flex items-start justify-between" style={{ gap: '4cqw' }}>
              <IssuerMark issuer={r.issuer} ink={design.ink} height="6.6cqw" maxWidth="38cqw" filterId={filterId} />
              <div className="min-w-0 max-w-[45%] text-right">{product}</div>
            </div>
            <div className="flex items-center" style={{ marginTop: '8cqw', gap: '3cqw' }}>
              <Chip tone={design.chip} vertical={false} />
              <Contactless color={ink.text} width="5.2cqw" />
            </div>
            <div style={{ marginTop: '5.5cqw' }}>{number}</div>
            <div className="mt-auto flex items-end justify-between" style={{ gap: '4cqw' }}>
              <div className="min-w-0">{holderName}</div>
              <NetworkMark network={r.network} ink={design.ink} width="14cqw" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
