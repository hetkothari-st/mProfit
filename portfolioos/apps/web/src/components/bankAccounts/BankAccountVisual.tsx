import type { CSSProperties } from 'react';
import { formatINR } from '@everypaisa/shared';
import type { BankAccountDTO } from '@/api/bankAccounts.api';
import { usePrivacyStore } from '@/stores/privacy.store';
import { AccountNumberReveal } from '@/components/bankAccounts/AccountNumberReveal';
import { BankLogo } from '@/components/bankAccounts/BankLogo';
import { bankBrandFor, tileSurface } from '@/lib/bankBrand';

// Text on the facade is always white: tileSurface() deepens every brand colour
// until white clears WCAG AA, so one tone set works for every bank.
const TONE = {
  primary: 'text-white',
  secondary: 'text-white/90',
  tertiary: 'text-white/60',
  dot: 'text-white/45',
} as const;

// Slate facade for a bank with no known brand colour.
const NEUTRAL = { from: '#475569', via: '#1e293b', to: '#020617', glow: '#94a3b8' };

// A mark this much wider than tall is a wordmark that already spells the
// bank's name, so the name board shows the logo alone.
const WORDMARK_ASPECT = 2.2;

/** The facade's colours and name-board treatment, from the bank's brand. */
function facade(bankName: string) {
  const brand = bankBrandFor(bankName);
  const wordmark = !!brand?.logo && brand.aspect >= WORDMARK_ASPECT;
  if (!brand?.color) return { slug: brand?.slug ?? 'neutral', wordmark, ...NEUTRAL };
  const s = tileSurface(brand.color, brand.accent);
  return { slug: brand.slug, wordmark, from: s.from, via: s.via, to: s.to, glow: s.glow };
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
// as carved stone regardless of the bank colour.
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
  const look = facade(account.bankName);
  const hideSensitive = usePrivacyStore((s) => s.hideSensitive);
  const dim = account.status !== 'ACTIVE' ? 'grayscale opacity-75' : '';

  const surface: CSSProperties = {
    backgroundImage: `linear-gradient(135deg, ${look.from} 0%, ${look.via} 55%, ${look.to} 100%)`,
  };

  const nameSize = size === 'lg' ? 'text-[15px] sm:text-lg' : 'text-[12px] sm:text-sm';
  const balanceSize = size === 'lg' ? 'text-2xl sm:text-4xl' : 'text-xl sm:text-2xl';
  const acctSize = size === 'lg' ? 'text-sm sm:text-base' : 'text-xs sm:text-sm';
  const logoHeight = size === 'lg' ? 40 : 32;
  const logoMaxWidth = size === 'lg' ? 240 : 180;
  const columnCount = size === 'lg' ? 8 : 6;

  return (
    <div
      className={`relative w-full ${dim} drop-shadow-[0_12px_24px_rgba(0,0,0,0.28)] select-none`}
      aria-label={`${account.bankName} bank account`}
      data-brand={look.slug}
    >
      {/* ===== PEDIMENT (triangular roof) ===== */}
      <div className="relative mx-auto" style={{ width: '94%' }}>
        <div
          className={`relative text-white ${size === 'lg' ? 'h-12 sm:h-16' : 'h-9 sm:h-11'}`}
          style={{ ...surface, clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)' }}
        >
          {/* sunlit overlay so the roof reads lighter than the walls */}
          <div className="absolute inset-0 bg-white/10" />
          {/* tympanum emblem */}
          <div className="absolute inset-x-0 bottom-1 sm:bottom-1.5 flex justify-center">
            <span
              className={`text-[9px] sm:text-[11px] font-bold tracking-[0.15em] ${TONE.primary} drop-shadow`}
            >
              {bankInitials(account.bankName)}
            </span>
          </div>
        </div>
      </div>

      {/* ===== ENTABLATURE / NAME BOARD ===== */}
      <div className="relative -mt-px border-y border-white/20 text-white" style={surface}>
        <div className="absolute inset-0 bg-black/25" />
        <div className="relative flex items-center justify-center gap-2.5 px-3 py-2 sm:py-2.5">
          <BankLogo
            bankName={account.bankName}
            size={logoHeight}
            maxWidth={logoMaxWidth}
            className="shadow-md"
          />
          {/* A wordmark already spells the name; keep it for screen readers only. */}
          <span
            className={`truncate font-semibold uppercase tracking-[0.2em] ${TONE.primary} ${nameSize} drop-shadow ${look.wordmark ? 'sr-only' : ''}`}
            title={account.bankName}
          >
            {account.bankName}
          </span>
        </div>
      </div>

      {/* ===== COLONNADE BODY ===== */}
      <div className="relative overflow-hidden text-white" style={surface}>
        {/* the mark's second colour, as a soft glow behind the columns */}
        <div
          className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-35 blur-2xl"
          style={{ background: look.glow }}
        />
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
              <span className={`text-[9.5px] uppercase tracking-[0.22em] ${TONE.tertiary}`}>
                {account.accountType}
              </span>
              {account.nickname && (
                <span className={`text-[11px] font-medium truncate max-w-[55%] ${TONE.secondary}`}>
                  {account.nickname}
                </span>
              )}
            </div>

            {/* account number — masked by default; eye reveals the full number */}
            <AccountNumberReveal account={account} sizeClass={acctSize} tone={TONE} />

            {/* balance */}
            <div>
              <p className={`text-[9.5px] uppercase tracking-[0.22em] ${TONE.tertiary}`}>
                {account.status === 'ACTIVE' ? 'Available balance' : account.status}
              </p>
              <p
                className={`${balanceSize} font-semibold tabular-nums leading-tight ${TONE.primary} ${hideSensitive ? 'money-digits' : ''} drop-shadow`}
              >
                {account.currentBalance ? formatINR(account.currentBalance) : '—'}
              </p>
            </div>

            {/* holder */}
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <span className={`text-[9.5px] uppercase tracking-[0.22em] ${TONE.tertiary}`}>
                Holder
              </span>
              <span
                className={`text-xs font-medium uppercase tracking-wide truncate max-w-[70%] text-right ${TONE.primary}`}
                title={account.accountHolder}
              >
                {account.accountHolder}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== STYLOBATE / STEPS ===== */}
      {/* Steps are wider than 100%; `mx-auto` can't centre an over-wide block,
          so the excess spilled only to the right and into the next tile.
          Clip them flush with the facade on both sides. */}
      <div className="relative overflow-hidden">
        {[
          { w: '100%', shade: 'bg-black/25' },
          { w: '104%', shade: 'bg-black/35' },
          { w: '108%', shade: 'bg-black/45' },
        ].map((step, i) => (
          <div
            key={i}
            className={`relative mx-auto ${size === 'lg' ? 'h-2 sm:h-2.5' : 'h-1.5 sm:h-2'}`}
            style={{ ...surface, width: step.w }}
          >
            <div className={`absolute inset-0 ${step.shade}`} />
            <div className="absolute inset-x-0 top-0 h-px bg-white/15" />
          </div>
        ))}
      </div>
    </div>
  );
}
