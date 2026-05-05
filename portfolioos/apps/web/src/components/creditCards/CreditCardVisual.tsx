import { formatINR } from '@portfolioos/shared';
import type { CreditCardDTO } from '@/api/creditCards.api';

const CARD_GRADIENTS: Record<string, string> = {
  VISA: 'bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-950',
  MASTERCARD: 'bg-gradient-to-br from-rose-700 via-red-800 to-orange-900',
  AMEX: 'bg-gradient-to-br from-sky-600 via-sky-700 to-slate-900',
  RUPAY: 'bg-gradient-to-br from-orange-500 via-orange-700 to-amber-950',
};
const DEFAULT_CARD_GRADIENT = 'bg-gradient-to-br from-slate-700 via-slate-800 to-slate-950';

function NetworkLogo({ network }: { network: string | null }) {
  if (!network) return null;
  switch (network) {
    case 'VISA':
      return (
        <span className="font-extrabold italic text-white text-2xl tracking-tight drop-shadow-sm">
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
    case 'AMEX':
      return (
        <span className="font-bold text-white text-[11px] uppercase tracking-[0.18em] px-2 py-0.5 border border-white/40 rounded">
          American Express
        </span>
      );
    case 'RUPAY':
      return (
        <span className="font-bold italic text-white text-xl tracking-tight drop-shadow-sm">
          Ru<span className="text-orange-300">Pay</span>
        </span>
      );
    default:
      return null;
  }
}

function CardChip() {
  return (
    <div className="h-9 w-12 rounded-md bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-600 relative overflow-hidden shadow-inner">
      <div className="absolute inset-0 grid grid-cols-2 grid-rows-3 gap-px p-0.5 opacity-50">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-amber-700/40 rounded-sm" />
        ))}
      </div>
    </div>
  );
}

export function CreditCardVisual({ card, size = 'md' }: { card: CreditCardDTO; size?: 'md' | 'lg' }) {
  const gradient = (card.network && CARD_GRADIENTS[card.network]) ?? DEFAULT_CARD_GRADIENT;
  const dim = card.status !== 'ACTIVE' ? 'grayscale opacity-70' : '';
  const numberSize = size === 'lg' ? 'text-xl sm:text-2xl' : 'text-base sm:text-lg';
  const padding = size === 'lg' ? 'p-6' : 'p-4 sm:p-5';

  return (
    <div
      className={`relative w-full aspect-[1.586/1] rounded-xl ${gradient} ${dim} text-white shadow-lg overflow-hidden`}
    >
      <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/15 pointer-events-none" />
      <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-white/5 blur-2xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-black/15 blur-2xl pointer-events-none" />

      <div className={`relative h-full ${padding} flex flex-col justify-between`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/60">Card issuer</p>
            <p className="font-semibold text-sm sm:text-base truncate drop-shadow">{card.issuerBank}</p>
          </div>
          <div className="shrink-0">
            <NetworkLogo network={card.network} />
          </div>
        </div>

        <div className="flex items-center gap-3 -mt-1">
          <CardChip />
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/40">{card.cardName}</span>
        </div>

        <div className={`font-mono ${numberSize} tracking-[0.18em] sm:tracking-[0.22em] text-white/95 drop-shadow`}>
          <span className="text-white/40">●●●●</span>
          <span className="mx-1.5 sm:mx-2 text-white/40">●●●●</span>
          <span className="mx-1.5 sm:mx-2 text-white/40">●●●●</span>
          <span className="text-white">{card.last4}</span>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-[0.2em] text-white/50">Card holder</p>
            <p className="text-xs sm:text-sm font-medium uppercase tracking-wide truncate">{card.cardName}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-[0.2em] text-white/50">Limit</p>
            <p className="text-xs sm:text-sm font-semibold tabular-nums">{formatINR(card.creditLimit)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
