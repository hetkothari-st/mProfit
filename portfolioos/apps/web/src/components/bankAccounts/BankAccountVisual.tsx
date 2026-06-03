import { formatINR } from '@portfolioos/shared';
import type { BankAccountDTO } from '@/api/bankAccounts.api';
import { usePrivacyStore } from '@/stores/privacy.store';

interface PaletteVars {
  surface: string;
  primary: string;
  secondary: string;
  tertiary: string;
  dot: string;
  blob1: string;
  blob2: string;
}

// Bank-specific palettes. Match each bank to its visual identity. Keys are
// matched case-insensitive against the start of `bankName` so partial labels
// like "HDFC Bank Ltd" still resolve.
const PALETTES: Array<{ match: RegExp; palette: PaletteVars }> = [
  {
    match: /^hdfc/i,
    palette: {
      surface: 'bg-gradient-to-br from-[#1a3a8f] via-[#163073] to-[#0d1f4d] text-white',
      primary: 'text-white',
      secondary: 'text-white/90',
      tertiary: 'text-white/55',
      dot: 'text-white/45',
      blob1: 'bg-[#e6262a]/30',
      blob2: 'bg-black/25',
    },
  },
  {
    match: /^sbi|^state bank/i,
    palette: {
      surface: 'bg-gradient-to-br from-[#13408a] via-[#0d2f6b] to-[#081d44] text-white',
      primary: 'text-white',
      secondary: 'text-white/90',
      tertiary: 'text-white/55',
      dot: 'text-white/45',
      blob1: 'bg-white/8',
      blob2: 'bg-black/30',
    },
  },
  {
    match: /^icici/i,
    palette: {
      surface: 'bg-gradient-to-br from-[#b94d10] via-[#a13e0a] to-[#5c2305] text-white',
      primary: 'text-white',
      secondary: 'text-white/90',
      tertiary: 'text-white/55',
      dot: 'text-white/45',
      blob1: 'bg-white/8',
      blob2: 'bg-black/25',
    },
  },
  {
    match: /^axis/i,
    palette: {
      surface: 'bg-gradient-to-br from-[#8c1d3a] via-[#6b1129] to-[#3a0817] text-white',
      primary: 'text-white',
      secondary: 'text-white/90',
      tertiary: 'text-white/55',
      dot: 'text-white/45',
      blob1: 'bg-white/8',
      blob2: 'bg-black/25',
    },
  },
  {
    match: /^kotak/i,
    palette: {
      surface: 'bg-gradient-to-br from-[#c41e3a] via-[#9c1730] to-[#560819] text-white',
      primary: 'text-white',
      secondary: 'text-white/90',
      tertiary: 'text-white/55',
      dot: 'text-white/45',
      blob1: 'bg-white/8',
      blob2: 'bg-black/25',
    },
  },
  {
    match: /^yes/i,
    palette: {
      surface: 'bg-gradient-to-br from-[#0e4ea1] via-[#093578] to-[#04204a] text-white',
      primary: 'text-white',
      secondary: 'text-white/90',
      tertiary: 'text-white/55',
      dot: 'text-white/45',
      blob1: 'bg-white/8',
      blob2: 'bg-black/25',
    },
  },
  {
    match: /^idfc/i,
    palette: {
      surface: 'bg-gradient-to-br from-[#7b1e2d] via-[#5b1421] to-[#2e0810] text-white',
      primary: 'text-white',
      secondary: 'text-white/90',
      tertiary: 'text-white/55',
      dot: 'text-white/45',
      blob1: 'bg-white/8',
      blob2: 'bg-black/25',
    },
  },
  {
    match: /^indusind/i,
    palette: {
      surface: 'bg-gradient-to-br from-[#a93226] via-[#7d241b] to-[#3c100c] text-white',
      primary: 'text-white',
      secondary: 'text-white/90',
      tertiary: 'text-white/55',
      dot: 'text-white/45',
      blob1: 'bg-white/8',
      blob2: 'bg-black/25',
    },
  },
  {
    match: /^rbl/i,
    palette: {
      surface: 'bg-gradient-to-br from-[#d97706] via-[#a85608] to-[#5c2e05] text-white',
      primary: 'text-white',
      secondary: 'text-white/90',
      tertiary: 'text-white/55',
      dot: 'text-white/45',
      blob1: 'bg-white/8',
      blob2: 'bg-black/25',
    },
  },
  {
    match: /^pnb|^punjab/i,
    palette: {
      surface: 'bg-gradient-to-br from-[#7b1c4e] via-[#5a133a] to-[#2d091d] text-white',
      primary: 'text-white',
      secondary: 'text-white/90',
      tertiary: 'text-white/55',
      dot: 'text-white/45',
      blob1: 'bg-white/8',
      blob2: 'bg-black/25',
    },
  },
  {
    match: /^bank of baroda|^bob/i,
    palette: {
      surface: 'bg-gradient-to-br from-[#e87722] via-[#b25b16] to-[#5e2f08] text-white',
      primary: 'text-white',
      secondary: 'text-white/90',
      tertiary: 'text-white/55',
      dot: 'text-white/45',
      blob1: 'bg-white/8',
      blob2: 'bg-black/25',
    },
  },
  {
    match: /^union/i,
    palette: {
      surface: 'bg-gradient-to-br from-[#0e7c5a] via-[#0a5b43] to-[#062e22] text-white',
      primary: 'text-white',
      secondary: 'text-white/90',
      tertiary: 'text-white/55',
      dot: 'text-white/45',
      blob1: 'bg-white/8',
      blob2: 'bg-black/25',
    },
  },
  {
    match: /^canara/i,
    palette: {
      surface: 'bg-gradient-to-br from-[#003b73] via-[#002a54] to-[#001530] text-white',
      primary: 'text-white',
      secondary: 'text-white/90',
      tertiary: 'text-white/55',
      dot: 'text-white/45',
      blob1: 'bg-white/8',
      blob2: 'bg-black/25',
    },
  },
];

const DEFAULT_PALETTE: PaletteVars = {
  surface: 'bg-gradient-to-br from-slate-700 via-slate-800 to-slate-950 text-white',
  primary: 'text-white',
  secondary: 'text-white/90',
  tertiary: 'text-white/55',
  dot: 'text-white/45',
  blob1: 'bg-white/8',
  blob2: 'bg-black/25',
};

function resolvePalette(bankName: string): PaletteVars {
  for (const { match, palette } of PALETTES) {
    if (match.test(bankName)) return palette;
  }
  return DEFAULT_PALETTE;
}

function bankInitials(name: string): string {
  return (
    name
      .replace(/\b(bank|of|the|ltd|limited)\b/gi, '')
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 3)
      .toUpperCase() || '₹'
  );
}

// A single fluted classical column: capital on top, fluted shaft, base at
// bottom. Rendered in the brand tone via translucent white overlays so it reads
// as carved stone regardless of the bank palette.
function Column() {
  return (
    <div className="relative flex h-full flex-col items-center">
      {/* capital */}
      <div className="h-1.5 w-[140%] rounded-sm bg-white/25 shadow-sm" />
      {/* fluted shaft */}
      <div className="relative w-full flex-1 bg-gradient-to-r from-white/5 via-white/22 to-white/5">
        <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0,transparent_2px,rgba(0,0,0,0.18)_2px,rgba(0,0,0,0.18)_3px)]" />
      </div>
      {/* base */}
      <div className="h-1.5 w-[140%] rounded-sm bg-white/25 shadow-sm" />
    </div>
  );
}

export function BankAccountVisual({
  account,
  size = 'md',
}: {
  account: BankAccountDTO;
  size?: 'md' | 'lg';
}) {
  const palette = resolvePalette(account.bankName);
  const hideSensitive = usePrivacyStore((s) => s.hideSensitive);
  const dim = account.status !== 'ACTIVE' ? 'grayscale opacity-75' : '';

  const nameSize = size === 'lg' ? 'text-[15px] sm:text-lg' : 'text-[12px] sm:text-sm';
  const balanceSize = size === 'lg' ? 'text-2xl sm:text-4xl' : 'text-xl sm:text-2xl';
  const acctSize = size === 'lg' ? 'text-sm sm:text-base' : 'text-xs sm:text-sm';
  const columnCount = size === 'lg' ? 8 : 6;

  return (
    <div
      className={`relative w-full ${dim} drop-shadow-[0_12px_24px_rgba(0,0,0,0.28)] select-none`}
      aria-label={`${account.bankName} bank account`}
    >
      {/* ===== PEDIMENT (triangular roof) ===== */}
      <div className="relative mx-auto" style={{ width: '94%' }}>
        <div
          className={`relative ${palette.surface} ${size === 'lg' ? 'h-12 sm:h-16' : 'h-9 sm:h-11'}`}
          style={{ clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)' }}
        >
          {/* sunlit overlay so the roof reads lighter than the walls */}
          <div className="absolute inset-0 bg-white/10" />
          {/* tympanum emblem */}
          <div className="absolute inset-x-0 bottom-1 sm:bottom-1.5 flex justify-center">
            <span
              className={`text-[9px] sm:text-[11px] font-bold tracking-[0.15em] ${palette.primary} drop-shadow`}
            >
              {bankInitials(account.bankName)}
            </span>
          </div>
        </div>
      </div>

      {/* ===== ENTABLATURE / NAME BOARD ===== */}
      <div
        className={`relative -mt-px ${palette.surface} border-y border-white/20`}
      >
        <div className="absolute inset-0 bg-black/25" />
        <div className="relative flex items-center justify-center px-3 py-2 sm:py-2.5">
          <span
            className={`truncate font-semibold uppercase tracking-[0.2em] ${palette.primary} ${nameSize} drop-shadow`}
            title={account.bankName}
          >
            {account.bankName}
          </span>
        </div>
      </div>

      {/* ===== COLONNADE BODY ===== */}
      <div className={`relative ${palette.surface} overflow-hidden`}>
        {/* diagonal stone highlight */}
        <div className="absolute inset-0 bg-gradient-to-tr from-black/20 via-white/5 to-white/12 pointer-events-none" />

        {/* fluted columns spanning the facade */}
        <div className="absolute inset-x-0 top-0 bottom-0 flex items-stretch justify-between gap-2 px-3 sm:px-4 py-2 pointer-events-none opacity-60">
          {Array.from({ length: columnCount }).map((_, i) => (
            <div key={i} className="w-2.5 sm:w-3">
              <Column />
            </div>
          ))}
        </div>

        {/* inner sanctum: readable account details sit in front of the columns */}
        <div className="relative px-4 sm:px-6 py-4 sm:py-5">
          <div className="mx-auto max-w-[88%] rounded-md bg-black/25 ring-1 ring-white/15 backdrop-blur-[2px] px-3 sm:px-4 py-3 sm:py-3.5 space-y-2.5">
            {/* top row: type + nickname */}
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[9.5px] uppercase tracking-[0.22em] ${palette.tertiary}`}>
                {account.accountType}
              </span>
              {account.nickname && (
                <span className={`text-[11px] font-medium truncate max-w-[55%] ${palette.secondary}`}>
                  {account.nickname}
                </span>
              )}
            </div>

            {/* account number */}
            <div className={`font-mono ${acctSize} tracking-[0.16em] ${palette.secondary}`}>
              <span className={palette.dot}>●●●●</span>
              <span className={`mx-1.5 ${palette.dot}`}>●●●●</span>
              <span className={palette.primary}>{account.last4}</span>
            </div>

            {/* balance */}
            <div>
              <p className={`text-[9.5px] uppercase tracking-[0.22em] ${palette.tertiary}`}>
                {account.status === 'ACTIVE' ? 'Available balance' : account.status}
              </p>
              <p
                className={`${balanceSize} font-semibold tabular-nums leading-tight ${palette.primary} ${hideSensitive ? 'money-digits' : ''} drop-shadow`}
              >
                {account.currentBalance ? formatINR(account.currentBalance) : '—'}
              </p>
            </div>

            {/* holder */}
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <span className={`text-[9.5px] uppercase tracking-[0.22em] ${palette.tertiary}`}>
                Holder
              </span>
              <span
                className={`text-xs font-medium uppercase tracking-wide truncate max-w-[70%] text-right ${palette.primary}`}
                title={account.accountHolder}
              >
                {account.accountHolder}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== STYLOBATE / STEPS ===== */}
      <div className="relative">
        {[
          { w: '100%', shade: 'bg-black/25' },
          { w: '104%', shade: 'bg-black/35' },
          { w: '108%', shade: 'bg-black/45' },
        ].map((step, i) => (
          <div
            key={i}
            className={`relative mx-auto ${palette.surface} ${size === 'lg' ? 'h-2 sm:h-2.5' : 'h-1.5 sm:h-2'}`}
            style={{ width: step.w }}
          >
            <div className={`absolute inset-0 ${step.shade}`} />
            <div className="absolute inset-x-0 top-0 h-px bg-white/15" />
          </div>
        ))}
      </div>
    </div>
  );
}
