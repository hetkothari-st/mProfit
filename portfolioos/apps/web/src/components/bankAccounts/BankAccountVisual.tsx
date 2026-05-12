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

function BankWordmark({
  name,
  tone,
}: {
  name: string;
  tone: PaletteVars;
}) {
  const initials = name
    .replace(/\b(bank|of|the|ltd|limited)\b/gi, '')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`grid h-9 w-9 place-items-center rounded-md bg-white/15 ring-1 ring-white/20 backdrop-blur-sm text-[12px] font-bold tracking-tight ${tone.primary}`}
      >
        {initials || '₹'}
      </span>
      <div className="leading-tight min-w-0">
        <p className={`text-[9.5px] uppercase tracking-[0.22em] ${tone.tertiary}`}>
          Account with
        </p>
        <p className={`text-[14px] font-semibold truncate drop-shadow ${tone.primary}`}>{name}</p>
      </div>
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
  const padding = size === 'lg' ? 'p-6' : 'p-4 sm:p-5';
  const acctNumberSize = size === 'lg' ? 'text-xl' : 'text-base sm:text-lg';
  const balanceSize = size === 'lg' ? 'text-3xl' : 'text-2xl';

  return (
    <div
      className={`relative w-full aspect-[1.586/1] rounded-xl ${palette.surface} ${dim} shadow-lg overflow-hidden`}
    >
      {/* Decorative blobs */}
      <div className={`absolute -top-12 -right-12 h-40 w-40 rounded-full ${palette.blob1} blur-2xl pointer-events-none`} />
      <div className={`absolute -bottom-16 -left-10 h-44 w-44 rounded-full ${palette.blob2} blur-2xl pointer-events-none`} />
      {/* Subtle diagonal highlight */}
      <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/15 pointer-events-none" />

      <div className={`relative h-full ${padding} flex flex-col justify-between`}>
        <div className="flex items-start justify-between gap-3">
          <BankWordmark name={account.bankName} tone={palette} />
          <div className="text-right shrink-0">
            <p className={`text-[9.5px] uppercase tracking-[0.22em] ${palette.tertiary}`}>
              {account.accountType}
            </p>
            {account.nickname && (
              <p className={`text-[11px] font-medium ${palette.secondary} max-w-[150px] truncate`}>
                {account.nickname}
              </p>
            )}
          </div>
        </div>

        <div>
          <p className={`text-[9.5px] uppercase tracking-[0.22em] ${palette.tertiary} mb-1`}>
            Account number
          </p>
          <div className={`font-mono ${acctNumberSize} tracking-[0.18em] ${palette.secondary} drop-shadow`}>
            <span className={palette.dot}>●●●●</span>
            <span className={`mx-1.5 sm:mx-2 ${palette.dot}`}>●●●●</span>
            <span className={`mx-1.5 sm:mx-2 ${palette.dot}`}>●●●●</span>
            <span className={palette.primary}>{account.last4}</span>
          </div>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className={`text-[9.5px] uppercase tracking-[0.22em] ${palette.tertiary}`}>
              {account.status === 'ACTIVE' ? 'Available balance' : account.status}
            </p>
            <p className={`${balanceSize} font-semibold tabular-nums ${palette.primary} ${hideSensitive ? 'money-digits' : ''} drop-shadow`}>
              {account.currentBalance ? formatINR(account.currentBalance) : '—'}
            </p>
          </div>
          <div className="text-right min-w-0">
            <p className={`text-[9.5px] uppercase tracking-[0.22em] ${palette.tertiary}`}>Holder</p>
            <p
              className={`text-xs font-medium uppercase tracking-wide truncate max-w-[140px] ${palette.primary}`}
              title={account.accountHolder}
            >
              {account.accountHolder}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
