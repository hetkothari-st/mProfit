import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import {
  CalendarClock,
  ChevronDown,
  Landmark,
  Pencil,
  PiggyBank,
  Plus,
} from 'lucide-react';
import { Decimal, formatINR } from '@portfolioos/shared';
import type { AssetClass, HoldingRow, TransactionDTO } from '@portfolioos/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { DownloadReportButton } from '@/components/reports/DownloadReportButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';
import { portfoliosApi } from '@/api/portfolios.api';
import { transactionsApi } from '@/api/transactions.api';
import { FDFormDialog } from './FDFormDialog';
import { useThemeStore } from '@/stores/theme.store';
import { BankLogo } from '@/components/bankAccounts/BankLogo';
import { bankBrandFor, brandAccent, tileSurface, type TileSurface } from '@/lib/bankBrand';

type FDHolding = HoldingRow & { portfolioName: string; portfolioId: string };

const FD_ACCENT = 'hsl(var(--positive))';
// RD used `hsl(var(--accent))` before, which in dark mode is a lime
// (`70 95% 65%`) sitting right next to --positive's lime-green
// (`85 75% 58%`) — the two card types read as the same color. Give RD
// a fixed indigo-violet identity instead, independent of the theme's
// --accent (which shifts between indigo in light mode and lime in dark
// mode), so it stays visually distinct from FD in both themes.
const RD_ACCENT_DARK = 'hsl(235 85% 72%)';
const RD_ACCENT_LIGHT = 'hsl(235 65% 48%)';
function useRdAccent(): string {
  const dark = useThemeStore((s) => s.dark);
  return dark ? RD_ACCENT_DARK : RD_ACCENT_LIGHT;
}

function daysUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function monthsBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function freqCompoundN(freq: string | null | undefined): number {
  switch (freq) {
    case 'MONTHLY': return 12;
    case 'QUARTERLY': return 4;
    case 'HALF_YEARLY': return 2;
    case 'ANNUAL': return 1;
    default: return 0;
  }
}

function fdMaturityValue(
  principal: string,
  ratePct: string | null | undefined,
  months: number | null,
  freq: string | null | undefined,
): Decimal | null {
  if (!ratePct || !months || months <= 0) return null;
  try {
    const p = new Decimal(principal);
    const r = new Decimal(ratePct).div(100);
    const years = new Decimal(months).div(12);
    const n = freqCompoundN(freq);
    if (n === 0) {
      return p.times(new Decimal(1).plus(r.times(years)));
    }
    const base = new Decimal(1).plus(r.div(n));
    const exp = n * months / 12;
    return p.times(base.pow(exp));
  } catch {
    return null;
  }
}

function rdMaturityValue(
  monthly: string | null | undefined,
  ratePct: string | null | undefined,
  months: number | null,
): Decimal | null {
  if (!monthly || !ratePct || !months || months <= 0) return null;
  try {
    const m = new Decimal(monthly);
    const r = new Decimal(ratePct).div(100);
    const i = r.div(12);
    if (i.isZero()) return m.times(months);
    const factor = new Decimal(1).plus(i).pow(months).minus(1).div(i);
    return m.times(factor).times(new Decimal(1).plus(i));
  } catch {
    return null;
  }
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ── Deposit cards ────────────────────────────────────────────────────────────
//
// Each card reads like the receipt a bank hands you for a deposit: a header
// printed in the issuing bank's colours — its logo, the rate, fine security
// linework — over a plain body: what the money becomes, how far along it is,
// and the terms you'd look up on the receipt (principal, tenure, EMI, next due).

const FD_FALLBACK = '#15803d'; // green, for issuers outside the bank list
const RD_FALLBACK = '#4f46e5'; // indigo

const PAYOUT_TEXT: Record<string, string> = {
  MONTHLY: 'Interest paid monthly',
  QUARTERLY: 'Interest paid quarterly',
  HALF_YEARLY: 'Interest paid half-yearly',
  ANNUAL: 'Interest paid yearly',
  AT_MATURITY: 'Interest paid at maturity',
};

const PAYOUT_STEP_MONTHS: Record<string, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  HALF_YEARLY: 6,
  ANNUAL: 12,
};

function addMonthsIso(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The next periodic interest credit on or after today, counted from the
 * opening date in payout-frequency steps and capped at maturity. Null when
 * interest is only paid at maturity (or the dates aren't known).
 */
function nextPayoutDate(openDate: string | null, maturity: string | null, freq: string | null): string | null {
  const step = freq ? PAYOUT_STEP_MONTHS[freq] : undefined;
  if (!openDate || !maturity || !step) return null;
  const today = todayIso();
  for (let n = 1; n <= 1200; n++) {
    const due = addMonthsIso(openDate, n * step);
    if (due >= maturity) return maturity;
    if (due >= today) return due;
  }
  return maturity;
}

/** Header colours and a theme-readable accent for a deposit's issuer. */
function useDepositLook(issuer: string, fallback: string) {
  const dark = useThemeStore((s) => s.dark);
  const brand = bankBrandFor(issuer);
  const base = brand?.color ?? fallback;
  return {
    panel: tileSurface(base, brand?.color ? brand.accent : null),
    accent: brandAccent(base, dark),
  };
}

// Phase-shifted waves, like the guilloché printed on FD receipts and cheques.
// Computed once; drawn in white at low opacity over the brand colour.
const GUILLOCHE = Array.from({ length: 9 }, (_, i) => {
  let d = '';
  for (let x = 0; x <= 400; x += 5) {
    const t = (x / 400) * Math.PI;
    const y = 60 + Math.sin(t * 4 + i * 0.55) * (16 + i * 3) + Math.sin(t * 11 + i) * 3;
    d += `${x === 0 ? 'M' : 'L'}${x} ${y.toFixed(1)}`;
  }
  return d;
});

function Guilloche() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 400 120"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.14]"
    >
      {GUILLOCHE.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="white" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

function ReceiptHeader({
  issuer,
  panel,
  kind,
  rate,
  holder,
  terms,
  serial,
  matured,
  onEdit,
}: {
  issuer: string;
  panel: TileSurface;
  kind: string;
  rate: string | null;
  holder: string | null;
  terms: string;
  serial: string;
  matured: boolean;
  onEdit: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className="relative overflow-hidden px-5 pb-3 pt-4 text-white"
      style={{
        backgroundImage: `linear-gradient(135deg, ${panel.from} 0%, ${panel.via} 60%, ${panel.to} 100%)`,
      }}
    >
      <Guilloche />
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <BankLogo bankName={issuer} size={30} maxWidth={140} className="shadow-md" />
          <h3 className="mt-3 truncate font-display text-[26px] leading-none">{issuer || 'Deposit'}</h3>
          {holder && <p className="mt-2 truncate text-sm text-white/85">{holder}</p>}
          <p className="mt-0.5 text-[13px] text-white/65">{terms}</p>
        </div>
        {rate && (
          <div className="shrink-0 text-right">
            <p className="font-display text-[40px] leading-none tabular-nums">
              {rate}
              <span className="text-2xl">%</span>
            </p>
            <p className="mt-1 text-xs text-white/70">a year</p>
          </div>
        )}
      </div>
      <div className="relative mt-4 flex items-center justify-between gap-3 text-[11px] text-white/55">
        <span className="tabular-nums">
          {kind} no. {serial}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onEdit(e);
          }}
          aria-label="Edit deposit"
          className="-m-1 rounded p-1 text-white/60 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
      {matured && (
        <div className="pointer-events-none absolute bottom-8 right-5 -rotate-12 rounded-sm border-2 border-white/70 px-2 py-0.5 font-display text-sm text-white/85">
          Matured
        </div>
      )}
    </div>
  );
}

function MaturityTrack({
  accent,
  pct,
  opened,
  maturity,
  showBar = true,
}: {
  accent: string;
  pct: number;
  opened: string | null;
  maturity: string | null;
  showBar?: boolean;
}) {
  const days = maturity ? daysUntil(maturity) : null;
  const soon = days != null && days >= 0 && days <= 30;
  return (
    <div>
      {showBar && (
        <div className="relative mb-2 h-1.5 rounded-full bg-muted">
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: accent }} />
          {pct > 0 && pct < 100 && (
            <span
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-[3px] ring-card"
              style={{ left: `${pct}%`, background: accent }}
            />
          )}
        </div>
      )}
      <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
        <span>{opened ? `Opened ${formatShortDate(opened)}` : 'Opening date not set'}</span>
        <span className={soon ? 'text-warning' : undefined}>
          {maturity == null || days == null
            ? 'Maturity date not set'
            : days < 0
              ? `Matured ${formatShortDate(maturity)}`
              : `Matures ${formatShortDate(maturity)}, ${days === 0 ? 'today' : `in ${days} days`}`}
        </span>
      </div>
    </div>
  );
}

function Figure({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  /** Tooltip for the value, e.g. why it's highlighted. */
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p title={hint} className={`mt-0.5 truncate text-[15px] tabular-nums ${className ?? 'text-foreground'}`}>
        {children}
      </p>
    </div>
  );
}

function InterestSoFar({ holding }: { holding: FDHolding }) {
  if (!holding.currentValue) return <span className="text-muted-foreground">—</span>;
  const earned = new Decimal(holding.currentValue).minus(holding.totalCost);
  const pct = new Decimal(holding.totalCost).isZero() ? null : earned.div(holding.totalCost).times(100);
  const up = earned.gte(0);
  return (
    <span className={up ? 'text-positive' : 'text-negative'}>
      <span className="money-digits">
        {up ? '+' : ''}
        {formatINR(earned.toString())}
      </span>
      {pct && (
        <span className="ml-1 text-xs opacity-75">
          {up ? '+' : ''}
          {pct.toFixed(2)}%
        </span>
      )}
    </span>
  );
}

/** "At maturity" + the value in the bank's accent — the number the card leads with. */
function MaturityValue({ value, accent }: { value: Decimal | null; accent: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">At maturity</p>
      <p
        className="money-digits font-display text-[30px] leading-tight tabular-nums"
        style={value ? { color: accent } : undefined}
      >
        {value ? formatINR(value.toString()) : '—'}
      </p>
    </div>
  );
}

/** The whole card is a link to the deposit; Enter opens it too. */
function DepositCardShell({
  label,
  matured,
  onClick,
  children,
}: {
  label: string;
  matured: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={label}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) onClick();
      }}
      className={`group cursor-pointer rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${matured ? 'opacity-70' : ''}`}
    >
      <Card className="overflow-hidden p-0 transition-shadow duration-300 group-hover:shadow-elev-lg">
        {children}
      </Card>
    </div>
  );
}

function FDCard({
  holding,
  primaryTxn,
  onClick,
  onEdit,
}: {
  holding: FDHolding;
  primaryTxn: TransactionDTO | null;
  onClick: () => void;
  onEdit: (e: React.MouseEvent) => void;
}) {
  const issuer = holding.assetName ?? '';
  const { panel, accent } = useDepositLook(issuer, FD_FALLBACK);
  const rate = primaryTxn?.interestRate || null;
  const freq = primaryTxn?.interestFrequency ?? null;
  const maturity = primaryTxn?.maturityDate ?? null;
  const openDate = primaryTxn?.tradeDate ?? null;

  const tenureMonths = openDate && maturity ? monthsBetween(openDate, maturity) : null;
  const elapsedPct = openDate && maturity
    ? (() => {
        const start = new Date(`${openDate}T00:00:00Z`).getTime();
        const end = new Date(`${maturity}T00:00:00Z`).getTime();
        return Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100));
      })()
    : 0;

  const serial = holding.id.replace(/[^A-Z0-9]/gi, '').slice(-8).toUpperCase();
  const matValue = fdMaturityValue(holding.totalCost, rate, tenureMonths, freq);
  const matured = maturity ? daysUntil(maturity) < 0 : false;
  const payout = matured ? null : nextPayoutDate(openDate, maturity, freq);

  return (
    <DepositCardShell label={`${issuer || 'Deposit'} fixed deposit`} matured={matured} onClick={onClick}>
      <ReceiptHeader
        issuer={issuer}
        panel={panel}
        kind="Fixed deposit"
        rate={rate}
        holder={holding.portfolioName || null}
        terms={(freq && PAYOUT_TEXT[freq]) || 'Payout not set'}
        serial={serial}
        matured={matured}
        onEdit={onEdit}
      />
      <CardContent className="space-y-4 px-5 py-4">
        <MaturityValue value={matValue} accent={accent} />

        {tenureMonths != null ? (
          <MaturityTrack accent={accent} pct={elapsedPct} opened={openDate} maturity={maturity} />
        ) : (
          <p className="text-xs text-muted-foreground">
            Add a rate and maturity date to see what this deposit becomes.
          </p>
        )}

        <div className="grid grid-cols-3 gap-x-4 gap-y-3 border-t border-border/60 pt-3">
          <Figure label="Principal">
            <span className="money-digits">{formatINR(holding.totalCost)}</span>
          </Figure>
          <Figure label="Tenure">{tenureMonths ? `${tenureMonths} months` : '—'}</Figure>
          <Figure label="Next payout">
            {matured
              ? 'Paid out'
              : payout
                ? formatShortDate(payout)
                : freq === 'AT_MATURITY' && maturity
                  ? 'At maturity'
                  : '—'}
          </Figure>
          <Figure label="Completed">{tenureMonths != null ? `${Math.round(elapsedPct)}%` : '—'}</Figure>
          <Figure label="Worth today">
            <span className="money-digits">
              {holding.currentValue ? formatINR(holding.currentValue) : '—'}
            </span>
          </Figure>
          <Figure label="Interest so far">
            <InterestSoFar holding={holding} />
          </Figure>
        </div>
      </CardContent>
    </DepositCardShell>
  );
}

function RDCard({
  holding,
  primaryTxn,
  allDepositTxns,
  onClick,
  onEdit,
}: {
  holding: FDHolding;
  primaryTxn: TransactionDTO | null;
  allDepositTxns: TransactionDTO[];
  onClick: () => void;
  onEdit: (e: React.MouseEvent) => void;
}) {
  const issuer = holding.assetName ?? '';
  const { panel, accent } = useDepositLook(issuer, RD_FALLBACK);
  const rate = primaryTxn?.interestRate || null;
  const maturity = primaryTxn?.maturityDate ?? null;
  const openDate = primaryTxn?.tradeDate ?? null;
  const monthlyRaw = primaryTxn?.price ?? null;

  const tenureMonths = openDate && maturity ? monthsBetween(openDate, maturity) : null;
  const installmentsDone = allDepositTxns.length;
  const matValue = rdMaturityValue(monthlyRaw, rate, tenureMonths);
  const serial = holding.id.replace(/[^A-Z0-9]/gi, '').slice(-8).toUpperCase();
  const matured = maturity ? daysUntil(maturity) < 0 : false;

  const completedPct = tenureMonths ? Math.min(100, Math.round((installmentsDone / tenureMonths) * 100)) : null;
  // Installment k (from 0) falls due k months after the first one.
  const nextEmi =
    !matured && openDate && tenureMonths && installmentsDone < tenureMonths
      ? addMonthsIso(openDate, installmentsDone)
      : null;
  const emiOverdue = nextEmi != null && nextEmi < todayIso();
  const principal = monthlyRaw && tenureMonths ? new Decimal(monthlyRaw).times(tenureMonths) : null;

  // One stamp per month, up to 24; longer plans show the remainder as a count.
  const dotCount = tenureMonths ?? Math.max(installmentsDone, 12);
  const showDots = Math.min(dotCount, 24);
  const overflow = dotCount > 24;

  return (
    <DepositCardShell label={`${issuer || 'Deposit'} recurring deposit`} matured={matured} onClick={onClick}>
      <ReceiptHeader
        issuer={issuer}
        panel={panel}
        kind="Recurring deposit"
        rate={rate}
        holder={holding.portfolioName || null}
        terms="Interest compounded quarterly"
        serial={serial}
        matured={matured}
        onEdit={onEdit}
      />
      <CardContent className="space-y-4 px-5 py-4">
        <MaturityValue value={matValue} accent={accent} />

        <div>
          <div className="mb-2 flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">Installments paid</span>
            <span className="tabular-nums text-muted-foreground">
              <span className="font-semibold" style={{ color: accent }}>
                {installmentsDone}
              </span>{' '}
              of {tenureMonths ?? '—'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {Array.from({ length: showDots }, (_, i) => i < installmentsDone).map((paid, i) => (
              <span
                key={i}
                title={`Month ${i + 1}: ${paid ? 'paid' : 'due'}`}
                className={
                  paid
                    ? 'h-3 w-3 rounded-[3px]'
                    : 'h-3 w-3 rounded-[3px] border border-dashed border-border bg-muted/30'
                }
                style={paid ? { background: accent } : undefined}
              />
            ))}
            {overflow && (
              <span className="ml-1 text-xs tabular-nums text-muted-foreground">+{dotCount - 24}</span>
            )}
          </div>
        </div>

        <MaturityTrack accent={accent} pct={0} opened={openDate} maturity={maturity} showBar={false} />

        <div className="grid grid-cols-3 gap-x-4 gap-y-3 border-t border-border/60 pt-3">
          <Figure label="EMI">
            <span className="money-digits">{monthlyRaw ? formatINR(monthlyRaw) : '—'}</span>
          </Figure>
          <Figure label="Tenure">{tenureMonths ? `${tenureMonths} months` : '—'}</Figure>
          <Figure
            label="Next EMI"
            hint={emiOverdue ? 'Overdue — record the installment once paid' : undefined}
            className={emiOverdue ? 'text-warning' : undefined}
          >
            {nextEmi
              ? formatShortDate(nextEmi)
              : tenureMonths && installmentsDone >= tenureMonths
                ? 'All paid'
                : '—'}
          </Figure>
          <Figure label="Principal">
            <span className="money-digits">{principal ? formatINR(principal.toString()) : '—'}</span>
          </Figure>
          <Figure label="Completed">{completedPct != null ? `${completedPct}%` : '—'}</Figure>
          <Figure label="Interest so far">
            <InterestSoFar holding={holding} />
          </Figure>
        </div>
      </CardContent>
    </DepositCardShell>
  );
}

export function FixedDepositsPage() {
  const navigate = useNavigate();
  const RD_ACCENT = useRdAccent();
  const [formOpen, setFormOpen] = useState(false);
  const [editTxn, setEditTxn] = useState<TransactionDTO | null>(null);
  const [activeFormAssetClass, setActiveFormAssetClass] = useState<AssetClass>('FIXED_DEPOSIT');
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!addMenuOpen) return;
    function handler(e: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [addMenuOpen]);

  const { data: portfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: portfoliosApi.list,
  });

  const holdingsQueries = useQueries({
    queries: (portfolios ?? []).map((p) => ({
      queryKey: ['portfolio-holdings', p.id],
      queryFn: () => portfoliosApi.holdings(p.id),
    })),
  });

  const txnQueries = useQueries({
    queries: (['FIXED_DEPOSIT', 'RECURRING_DEPOSIT'] as const).map((ac) => ({
      queryKey: ['transactions', ac],
      queryFn: () => transactionsApi.list({ assetClass: ac, pageSize: 500 }),
    })),
  });

  const isLoading =
    !portfolios ||
    holdingsQueries.some((q) => q.isLoading) ||
    txnQueries.some((q) => q.isLoading);

  const allHoldings: FDHolding[] = [];
  (portfolios ?? []).forEach((p, i) => {
    const rows: HoldingRow[] = holdingsQueries[i]?.data ?? [];
    rows
      .filter((h) => h.assetClass === 'FIXED_DEPOSIT' || h.assetClass === 'RECURRING_DEPOSIT')
      .forEach((h) => allHoldings.push({ ...h, portfolioName: p.name, portfolioId: p.id }));
  });

  const fdHoldings = allHoldings.filter((h) => h.assetClass === 'FIXED_DEPOSIT');
  const rdHoldings = allHoldings.filter((h) => h.assetClass === 'RECURRING_DEPOSIT');

  const allTxns: TransactionDTO[] = txnQueries.flatMap((q) => q.data?.items ?? []);

  function txnsFor(h: FDHolding): TransactionDTO[] {
    const base = allTxns.filter(
      (t) => t.portfolioId === h.portfolioId && t.assetClass === h.assetClass,
    );
    const holdingIsin = normalizeText(h.isin);
    const holdingName = normalizeText(h.assetName);

    const isinMatched = holdingIsin
      ? base.filter((t) => normalizeText(t.isin) === holdingIsin)
      : [];
    if (isinMatched.length > 0) {
      return isinMatched.sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
    }

    const nameMatched = holdingName
      ? base.filter((t) => normalizeText(t.assetName) === holdingName)
      : [];
    if (nameMatched.length > 0) {
      return nameMatched.sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
    }

    if (base.length === 1) {
      return [...base].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
    }

    return [];
  }

  function depositTxnsFor(h: FDHolding): TransactionDTO[] {
    return txnsFor(h).filter((t) => t.transactionType === 'DEPOSIT');
  }

  function primaryTxnFor(h: FDHolding): TransactionDTO | null {
    const all = txnsFor(h);
    return all.find((t) => t.transactionType === 'DEPOSIT') ?? all[0] ?? null;
  }

  const totalInvested = allHoldings.reduce(
    (s, h) => s.plus(new Decimal(h.totalCost)),
    new Decimal(0),
  );
  const totalValue = allHoldings.reduce(
    (s, h) => (h.currentValue ? s.plus(new Decimal(h.currentValue)) : s),
    new Decimal(0),
  );
  const totalPnL = totalValue.minus(totalInvested);
  const pnlPct = totalInvested.isZero()
    ? null
    : totalPnL.div(totalInvested).times(100).toNumber();

  function openAdd(ac: AssetClass) {
    setActiveFormAssetClass(ac);
    setEditTxn(null);
    setFormOpen(true);
    setAddMenuOpen(false);
  }

  function openEdit(txn: TransactionDTO) {
    setActiveFormAssetClass(txn.assetClass as AssetClass);
    setEditTxn(txn);
    setFormOpen(true);
  }

  return (
    <div>
      <PageHeader
        title="Fixed & Recurring Deposits"
        description="Track FDs and RDs across banks — one-time deposits or monthly installments."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <DownloadReportButton type="holdings" assetClasses={['FIXED_DEPOSIT', 'RECURRING_DEPOSIT']} />
            <div className="relative" ref={addMenuRef}>
            <Button onClick={() => setAddMenuOpen((v) => !v)}>
              <Plus className="h-4 w-4" /> Add{' '}
              <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-70" />
            </Button>
            {addMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 rounded-md border bg-popover text-popover-foreground shadow-md z-20 py-1">
                {[
                  { ac: 'FIXED_DEPOSIT' as AssetClass, label: 'Fixed Deposit' },
                  { ac: 'RECURRING_DEPOSIT' as AssetClass, label: 'Recurring Deposit' },
                ].map(({ ac, label }) => (
                  <button
                    key={ac}
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                    onClick={() => openAdd(ac)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            </div>
          </div>
        }
      />

      {/* Summary strip */}
      {!isLoading && allHoldings.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {([
            { label: 'Total Invested', value: formatINR(totalInvested.toString()), sub: `${allHoldings.length} deposit${allHoldings.length === 1 ? '' : 's'}`, valueClass: '' },
            { label: 'Current Value', value: formatINR(totalValue.toString()), sub: 'live valuation', valueClass: '' },
            {
              label: 'Total Earnings',
              value: `${totalPnL.gte(0) ? '+' : ''}${formatINR(totalPnL.toString())}${pnlPct != null ? ` (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)` : ''}`,
              sub: 'realised + unrealised',
              valueClass: totalPnL.gte(0) ? 'text-positive' : 'text-negative',
            },
          ] as { label: string; value: string; sub: string; valueClass: string }[]).map((m) => (
            <Card key={m.label}>
              <CardContent className="px-4 py-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                  {m.label}
                </p>
                <p className={`text-lg sm:text-xl font-semibold tabular-nums mt-1 break-words ${m.valueClass}`}>
                  {m.value}
                </p>
                <p className="text-xs text-muted-foreground">{m.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="h-44 animate-pulse bg-muted/60" />
          ))}
        </div>
      )}

      {!isLoading && allHoldings.length === 0 && (
        <EmptyState
          icon={Landmark}
          title="No deposits yet"
          description="Add a Fixed or Recurring Deposit to start tracking."
          action={
            <Button onClick={() => openAdd('FIXED_DEPOSIT')}>
              <Plus className="h-4 w-4" /> Add first deposit
            </Button>
          }
        />
      )}

      {!isLoading && fdHoldings.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3 px-0.5">
            <PiggyBank className="h-3.5 w-3.5" style={{ color: FD_ACCENT }} strokeWidth={1.8} />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: FD_ACCENT }}>
              Fixed Deposits
            </h3>
            <span className="text-xs text-muted-foreground">({fdHoldings.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {fdHoldings.map((h) => {
              const primary = primaryTxnFor(h);
              return (
                <FDCard
                  key={h.id}
                  holding={h}
                  primaryTxn={primary}
                  onClick={() => navigate(`/fds/${h.id}`, { state: { holding: h } })}
                  onEdit={(e) => {
                    e.stopPropagation();
                    if (primary) openEdit(primary);
                  }}
                />
              );
            })}
          </div>
        </section>
      )}

      {!isLoading && rdHoldings.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3 px-0.5">
            <CalendarClock className="h-3.5 w-3.5" style={{ color: RD_ACCENT }} strokeWidth={1.8} />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: RD_ACCENT }}>
              Recurring Deposits
            </h3>
            <span className="text-xs text-muted-foreground">({rdHoldings.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rdHoldings.map((h) => {
              const primary = primaryTxnFor(h);
              const depositOnly = depositTxnsFor(h);
              return (
                <RDCard
                  key={h.id}
                  holding={h}
                  primaryTxn={primary}
                  allDepositTxns={depositOnly}
                  onClick={() => navigate(`/fds/${h.id}`, { state: { holding: h } })}
                  onEdit={(e) => {
                    e.stopPropagation();
                    if (primary) openEdit(primary);
                  }}
                />
              );
            })}
          </div>
        </section>
      )}

      <FDFormDialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditTxn(null);
        }}
        initial={editTxn}
        defaultPortfolioId={portfolios?.[0]?.id}
        defaultAssetClass={activeFormAssetClass}
      />
    </div>
  );
}
