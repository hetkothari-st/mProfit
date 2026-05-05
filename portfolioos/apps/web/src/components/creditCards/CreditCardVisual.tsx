import { formatINR } from '@portfolioos/shared';
import type { CreditCardDTO } from '@/api/creditCards.api';

interface PaletteVars {
  /** Tailwind classes applied to the outer card div: gradient + base text color. */
  surface: string;
  /** Primary text color (issuer, holder name, last4). */
  primary: string;
  /** Slightly muted text (card number masked dots, limit). */
  secondary: string;
  /** Heavily muted text (small labels). */
  tertiary: string;
  /** Network logo color override (used by NetworkLogo to flip white→dark). */
  logoTint: 'light' | 'dark';
  /** Inner shine + corner blob colors — keeps depth on light backgrounds. */
  shineFrom: string;
  shineTo: string;
  blob1: string;
  blob2: string;
}

const PALETTES: Record<string, PaletteVars> = {
  VISA: {
    surface: 'bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-950 text-white',
    primary: 'text-white',
    secondary: 'text-white/95',
    tertiary: 'text-white/50',
    logoTint: 'light',
    shineFrom: 'from-white/0',
    shineTo: 'to-white/15',
    blob1: 'bg-white/5',
    blob2: 'bg-black/15',
  },
  MASTERCARD: {
    surface: 'bg-gradient-to-br from-rose-700 via-red-800 to-orange-900 text-white',
    primary: 'text-white',
    secondary: 'text-white/95',
    tertiary: 'text-white/50',
    logoTint: 'light',
    shineFrom: 'from-white/0',
    shineTo: 'to-white/15',
    blob1: 'bg-white/5',
    blob2: 'bg-black/15',
  },
  AMEX: {
    surface: 'bg-gradient-to-br from-amber-200 via-yellow-400 to-amber-600 text-stone-900',
    primary: 'text-stone-900',
    secondary: 'text-stone-900/90',
    tertiary: 'text-stone-700/70',
    logoTint: 'dark',
    shineFrom: 'from-white/0',
    shineTo: 'to-white/40',
    blob1: 'bg-white/30',
    blob2: 'bg-amber-900/15',
  },
  RUPAY: {
    surface: 'bg-gradient-to-br from-orange-500 via-orange-700 to-amber-950 text-white',
    primary: 'text-white',
    secondary: 'text-white/95',
    tertiary: 'text-white/50',
    logoTint: 'light',
    shineFrom: 'from-white/0',
    shineTo: 'to-white/15',
    blob1: 'bg-white/5',
    blob2: 'bg-black/15',
  },
};

const DEFAULT_PALETTE: PaletteVars = {
  surface: 'bg-gradient-to-br from-slate-700 via-slate-800 to-slate-950 text-white',
  primary: 'text-white',
  secondary: 'text-white/95',
  tertiary: 'text-white/50',
  logoTint: 'light',
  shineFrom: 'from-white/0',
  shineTo: 'to-white/15',
  blob1: 'bg-white/5',
  blob2: 'bg-black/15',
};

function NetworkLogo({ network, tint }: { network: string | null; tint: 'light' | 'dark' }) {
  if (!network) return null;
  const txt = tint === 'light' ? 'text-white' : 'text-stone-900';
  switch (network) {
    case 'VISA':
      return (
        <span className={`font-extrabold italic ${txt} text-2xl tracking-tight drop-shadow-sm`}>
          VISA
        </span>
      );
    case 'MASTERCARD':
      return (
        <div className="flex items-center -space-x-3">
          <span className="h-7 w-7 rounded-full bg-red-500/90" />
          <span className="h-7 w-7 rounded-full bg-amber-400/90 mix-blend-screen" />
        </div>
      );
    case 'AMEX': {
      // Real Amex Gold uses navy/black wordmark on gold. Keep that.
      const border = tint === 'light' ? 'border-white/40' : 'border-stone-900/50';
      return (
        <span className={`font-bold ${txt} text-[11px] uppercase tracking-[0.18em] px-2 py-0.5 border ${border} rounded`}>
          American Express
        </span>
      );
    }
    case 'RUPAY':
      return (
        <span className={`font-bold italic ${txt} text-xl tracking-tight drop-shadow-sm`}>
          Ru<span className="text-orange-300">Pay</span>
        </span>
      );
    default:
      return null;
  }
}

function CardChip() {
  return (
    <div className="h-9 w-12 rounded-md bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-600 relative overflow-hidden shadow-inner ring-1 ring-amber-800/30">
      <div className="absolute inset-0 grid grid-cols-2 grid-rows-3 gap-px p-0.5 opacity-50">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-amber-700/40 rounded-sm" />
        ))}
      </div>
    </div>
  );
}

export function CreditCardVisual({ card, size = 'md' }: { card: CreditCardDTO; size?: 'md' | 'lg' }) {
  const palette: PaletteVars = (card.network ? PALETTES[card.network] : undefined) ?? DEFAULT_PALETTE;
  const dim = card.status !== 'ACTIVE' ? 'grayscale opacity-70' : '';
  const numberSize = size === 'lg' ? 'text-xl sm:text-2xl' : 'text-base sm:text-lg';
  const padding = size === 'lg' ? 'p-6' : 'p-4 sm:p-5';

  // Masked dots use slightly different opacity per palette so they stay visible
  // on both dark and light surfaces.
  const dotClass = palette.logoTint === 'dark' ? 'text-stone-900/40' : 'text-white/40';

  return (
    <div
      className={`relative w-full aspect-[1.586/1] rounded-xl ${palette.surface} ${dim} shadow-lg overflow-hidden`}
    >
      <div className={`absolute inset-0 bg-gradient-to-tr ${palette.shineFrom} via-white/5 ${palette.shineTo} pointer-events-none`} />
      <div className={`absolute -top-12 -right-12 h-40 w-40 rounded-full ${palette.blob1} blur-2xl pointer-events-none`} />
      <div className={`absolute -bottom-16 -left-10 h-44 w-44 rounded-full ${palette.blob2} blur-2xl pointer-events-none`} />

      <div className={`relative h-full ${padding} flex flex-col justify-between`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={`text-[10px] uppercase tracking-[0.2em] ${palette.tertiary}`}>Card issuer</p>
            <p className={`font-semibold text-sm sm:text-base truncate drop-shadow ${palette.primary}`}>{card.issuerBank}</p>
          </div>
          <div className="shrink-0">
            <NetworkLogo network={card.network} tint={palette.logoTint} />
          </div>
        </div>

        <div className="flex items-center gap-3 -mt-1">
          <CardChip />
          <span className={`text-[10px] uppercase tracking-[0.2em] ${palette.tertiary}`}>{card.cardName}</span>
        </div>

        <div className={`font-mono ${numberSize} tracking-[0.18em] sm:tracking-[0.22em] ${palette.secondary} drop-shadow`}>
          <span className={dotClass}>●●●●</span>
          <span className={`mx-1.5 sm:mx-2 ${dotClass}`}>●●●●</span>
          <span className={`mx-1.5 sm:mx-2 ${dotClass}`}>●●●●</span>
          <span className={palette.primary}>{card.last4}</span>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className={`text-[9px] uppercase tracking-[0.2em] ${palette.tertiary}`}>Card holder</p>
            <p className={`text-xs sm:text-sm font-medium uppercase tracking-wide truncate ${palette.primary}`}>{card.cardName}</p>
          </div>
          <div className="text-right">
            <p className={`text-[9px] uppercase tracking-[0.2em] ${palette.tertiary}`}>Limit</p>
            <p className={`text-xs sm:text-sm font-semibold tabular-nums ${palette.primary}`}>{formatINR(card.creditLimit)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
