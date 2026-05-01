import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Sun, Moon, ShieldCheck, TrendingUp, BarChart3 } from 'lucide-react';
import { useThemeStore } from '@/stores/theme.store';
import { cn } from '@/lib/cn';

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

const TRUST_POINTS = [
  { icon: ShieldCheck, label: 'Bank-grade encryption', detail: 'AES-256 column-level encryption · Postgres RLS' },
  { icon: BarChart3, label: 'Multi-asset clarity', detail: 'Stocks · MFs · F&O · Bonds · Gold · Property · NPS' },
  { icon: TrendingUp, label: 'Tax-ready ledgers', detail: 'FIFO capital gains · STCG/LTCG · Schedule 112A' },
];

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  const { dark, toggle } = useThemeStore();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="relative grid min-h-screen grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
        {/* ─── Left — editorial brand panel ─── */}
        <aside className="relative hidden lg:block overflow-hidden">
          {/* layered hero canvas */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `
                radial-gradient(120% 90% at 0% 0%, hsl(var(--accent) / 0.20) 0px, transparent 55%),
                radial-gradient(100% 80% at 100% 0%, hsl(var(--primary) / 0.14) 0px, transparent 55%),
                radial-gradient(140% 100% at 50% 130%, hsl(var(--accent) / 0.10) 0px, transparent 60%),
                linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--card) / 0.95) 100%)
              `,
            }}
          />
          {/* grain overlay */}
          <div
            className="absolute inset-0 mix-blend-overlay opacity-60 dark:opacity-35 dark:mix-blend-soft-light"
            style={{
              backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.06 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
              backgroundSize: '240px',
            }}
          />
          {/* hairline edge */}
          <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-border to-transparent" />

          <div className="relative z-10 flex h-full flex-col justify-between p-12 xl:p-16">
            {/* Brand mark */}
            <Link to="/" className="inline-flex items-center gap-3 group w-fit">
              <div className="relative h-11 w-11 rounded-md grid place-items-center bg-gradient-to-br from-accent via-accent/95 to-accent/75 text-accent-foreground shadow-md transition-transform group-hover:scale-[1.02]">
                <svg viewBox="0 0 24 24" className="h-5.5 w-5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 4v16" />
                  <path d="M5 4h8a4.5 4.5 0 0 1 0 9H5" />
                  <path d="M14 13l4 7" />
                </svg>
                <span className="absolute -inset-px rounded-md ring-1 ring-inset ring-foreground/10" />
              </div>
              <div className="flex items-baseline gap-[1px]">
                <span className="font-brand text-[24px] leading-none text-foreground">Portfolio</span>
                <span className="font-brand text-[24px] leading-none text-accent">OS</span>
              </div>
            </Link>

            {/* Editorial headline */}
            <div className="max-w-[440px]">
              <p className="text-[10px] font-medium uppercase tracking-kerned text-accent-ink mb-4">
                Private Wealth · India · est. 2026
              </p>
              <h2 className="font-display text-[52px] xl:text-[64px] leading-[0.98] tracking-[-0.012em] text-foreground text-balance">
                Every rupee, every asset — read between the lines.
              </h2>
              <p className="mt-6 max-w-[400px] text-[14px] leading-relaxed text-muted-foreground">
                A multi-asset portfolio ledger built for investors who want one honest number, not ten dashboards. Stocks, mutual funds, real estate, vehicles, insurance — observed in one place.
              </p>

              {/* ornament */}
              <div className="my-8 rule-ornament max-w-[320px]"><span /></div>

              {/* Mock allocation pie SVG */}
              <div className="flex items-center gap-5">
                <svg viewBox="0 0 120 120" className="h-[88px] w-[88px] shrink-0">
                  <circle cx="60" cy="60" r="46" fill="none" stroke="hsl(var(--border))" strokeWidth="0.5" />
                  {/* Donut segments — refined editorial palette */}
                  <circle cx="60" cy="60" r="40" fill="none" stroke="hsl(213 53% 22%)" strokeWidth="14" strokeDasharray="100 251" strokeDashoffset="0" transform="rotate(-90 60 60)" />
                  <circle cx="60" cy="60" r="40" fill="none" stroke="hsl(36 60% 48%)" strokeWidth="14" strokeDasharray="62 251" strokeDashoffset="-100" transform="rotate(-90 60 60)" />
                  <circle cx="60" cy="60" r="40" fill="none" stroke="hsl(130 35% 34%)" strokeWidth="14" strokeDasharray="48 251" strokeDashoffset="-162" transform="rotate(-90 60 60)" />
                  <circle cx="60" cy="60" r="40" fill="none" stroke="hsl(12 50% 44%)" strokeWidth="14" strokeDasharray="41 251" strokeDashoffset="-210" transform="rotate(-90 60 60)" />
                </svg>
                <div className="space-y-1.5 text-[11.5px]">
                  {[
                    { label: 'Equities', pct: '40%', color: 'hsl(213 53% 22%)' },
                    { label: 'Mutual Funds', pct: '25%', color: 'hsl(36 60% 48%)' },
                    { label: 'Real Estate', pct: '19%', color: 'hsl(130 35% 34%)' },
                    { label: 'Other', pct: '16%', color: 'hsl(12 50% 44%)' },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center gap-2 min-w-[180px]">
                      <span className="h-2 w-2 rounded-[1px] rotate-45 shrink-0" style={{ background: row.color }} />
                      <span className="text-muted-foreground flex-1">{row.label}</span>
                      <span className="numeric tabular-nums text-foreground/85 font-medium">{row.pct}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Trust points footer */}
            <div className="space-y-3 max-w-[440px]">
              {TRUST_POINTS.map((p) => (
                <div key={p.label} className="flex items-start gap-3">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border/70 bg-card/60">
                    <p.icon className="h-4 w-4 text-accent" strokeWidth={1.7} />
                  </div>
                  <div className="leading-tight pt-0.5">
                    <p className="text-[12.5px] font-medium text-foreground">{p.label}</p>
                    <p className="text-[11px] text-muted-foreground">{p.detail}</p>
                  </div>
                </div>
              ))}
              <p className="pt-4 text-[10px] uppercase tracking-kerned text-muted-foreground/70">
                © {new Date().getFullYear()} PortfolioOS · A multi-asset ledger for India
              </p>
            </div>
          </div>
        </aside>

        {/* ─── Right — form panel ─── */}
        <main className="relative flex flex-col">
          {/* Theme toggle */}
          <div className="absolute top-5 right-6 z-10">
            <button
              type="button"
              onClick={toggle}
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              className={cn(
                'relative h-9 w-9 rounded-md flex items-center justify-center border border-border/70 bg-card/70 backdrop-blur-sm',
                'text-muted-foreground hover:text-foreground hover:border-accent/50 transition-colors focus-ring overflow-hidden',
              )}
            >
              <Sun className={cn('absolute h-4 w-4 transition-all', dark ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-0 opacity-0')} strokeWidth={1.7} />
              <Moon className={cn('absolute h-4 w-4 transition-all', dark ? '-rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100')} strokeWidth={1.7} />
            </button>
          </div>

          {/* Mobile brand mark — only shows when left panel hidden */}
          <div className="lg:hidden flex items-center justify-center gap-2.5 pt-10 pb-2">
            <div className="relative h-10 w-10 rounded-md grid place-items-center bg-gradient-to-br from-accent via-accent/95 to-accent/75 text-accent-foreground shadow-sm">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 4v16" />
                <path d="M5 4h8a4.5 4.5 0 0 1 0 9H5" />
                <path d="M14 13l4 7" />
              </svg>
            </div>
            <div className="flex items-baseline gap-[1px]">
              <span className="font-brand text-[22px] leading-none text-foreground">Portfolio</span>
              <span className="font-brand text-[22px] leading-none text-accent">OS</span>
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center px-6 sm:px-12 py-10">
            <div className="w-full max-w-[420px] reveal">
              <div className="mb-8">
                <p className="text-[10px] font-medium uppercase tracking-kerned text-accent-ink mb-3">
                  Welcome
                </p>
                <h1 className="font-display text-[44px] sm:text-[48px] leading-[1] tracking-[-0.012em] text-foreground">
                  {title}
                </h1>
                {subtitle && (
                  <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground max-w-[380px]">
                    {subtitle}
                  </p>
                )}
              </div>

              {children}

              {footer && (
                <div className="mt-8 pt-6 border-t border-border/60 text-center text-[13px] text-muted-foreground">
                  {footer}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
