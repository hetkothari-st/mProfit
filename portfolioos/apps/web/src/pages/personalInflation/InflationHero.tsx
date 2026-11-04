import {
  CPI_SECTORS,
  CPI_SECTOR_LABELS,
  CPI_STATES,
  Decimal,
  cpiStateName,
  formatINR,
  type CpiSector,
  type PersonalInflationSummary,
} from '@everypaisa/shared';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/cn';
import { formatCpiMonth, formatRatePct } from './personalInflationView';

interface Props {
  data: PersonalInflationSummary;
  saving: boolean;
  onProfile: (p: { stateCode: number; sector: CpiSector }) => void;
}

const inr = (v: Decimal | string) => formatINR(v.toString(), { fractionDigits: 0 });

/** Round a scale's top up to a tidy step so tick labels read cleanly. */
function scaleTop(maxPct: number): { top: number; step: number } {
  const step = maxPct <= 8 ? 2 : maxPct <= 20 ? 5 : 10;
  return { top: Math.max(step * 2, Math.ceil((maxPct * 1.15) / step) * step), step };
}

/**
 * The page's one loud element: the user's rate against official CPI on a
 * shared scale, the gap between them shaded, and what that gap means in
 * rupees over ten years. The place pickers live here because they decide
 * the official marker.
 */
export function InflationHero({ data, saving, onProfile }: Props) {
  const headline = data.official.find((o) => o.divisionCode === '00');
  const cpi = headline?.longRunRate ? new Decimal(headline.longRunRate) : null;
  const mine = data.personalRate ? new Decimal(data.personalRate) : null;
  const place = cpiStateName(headline?.source === 'STATE' ? data.profile.stateCode : 1);
  const asOf = formatCpiMonth(data.asOf);

  const pct = (d: Decimal | null) => (d ? d.times(100).toNumber() : 0);
  const { top, step } = scaleTop(Math.max(pct(mine), pct(cpi), 1));
  const pos = (d: Decimal) => `${Math.min(100, Math.max(0, (d.times(100).toNumber() / top) * 100))}%`;
  const ticks = Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step);

  const above = mine && cpi ? mine.greaterThan(cpi) : false;
  const horizon = data.horizons.at(-1) ?? 10;
  const today = new Decimal(data.totals.annualAmount);
  const atMine = data.totals.projections.at(-1) ? new Decimal(data.totals.projections.at(-1)!) : null;
  const atCpi = cpi && !today.isZero() ? today.times(cpi.plus(1).pow(horizon)) : null;
  const extra = atMine && atCpi ? atMine.minus(atCpi) : null;

  const ratio = mine && cpi && cpi.greaterThan(0) ? mine.dividedBy(cpi) : null;

  return (
    <section className="rounded-xl border bg-card p-5 sm:p-7 reveal" aria-label="Your inflation compared with official CPI">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0">
          {mine ? (
            <h2 className="font-display text-[clamp(26px,6vw,40px)] leading-[1.05] tracking-[-0.01em] text-balance">
              Your costs rise <span className={cn('numeric', above ? 'text-warning' : 'text-positive')}>{formatRatePct(data.personalRate)}</span> a year.
            </h2>
          ) : (
            <h2 className="font-display text-[clamp(24px,5vw,34px)] leading-[1.1] tracking-[-0.01em] text-balance">
              Add your expenses to find your own inflation rate.
            </h2>
          )}
          <p className="mt-2 text-sm text-muted-foreground">
            {cpi
              ? <>Official CPI for {place}{data.profile.sector !== 'COMBINED' && `, ${CPI_SECTOR_LABELS[data.profile.sector].toLowerCase()}`}: <span className="numeric text-foreground">{formatRatePct(headline?.longRunRate)}</span> a year on average{ratio && mine && above && ratio.greaterThanOrEqualTo('1.2') && <>, so your costs climb about {ratio.toFixed(1)}× as fast</>}.</>
              : <>Official figures haven&apos;t loaded yet. They usually appear within a few minutes of the app starting.</>}
          </p>

          {(mine || cpi) && (
            <div className="mt-8" aria-hidden>
              <div className="relative h-2.5 rounded-full bg-muted">
                {mine && cpi && (
                  <div
                    className={cn('absolute inset-y-0 rounded-full', above ? 'bg-warning/35' : 'bg-positive/30')}
                    style={{
                      left: pos(Decimal.min(mine, cpi)),
                      width: `calc(${pos(Decimal.max(mine, cpi))} - ${pos(Decimal.min(mine, cpi))})`,
                    }}
                  />
                )}
                {cpi && (
                  <div className="absolute -top-2 -bottom-2 w-px bg-muted-foreground" style={{ left: pos(cpi) }}>
                    <span className="absolute bottom-full mb-1 -translate-x-1/2 whitespace-nowrap text-[11px] text-muted-foreground">
                      CPI {formatRatePct(headline?.longRunRate)}
                    </span>
                  </div>
                )}
                {mine && (
                  <div
                    className={cn(
                      'absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ring-card',
                      above ? 'bg-warning' : 'bg-positive',
                    )}
                    style={{ left: pos(mine) }}
                  >
                    <span className="absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold text-foreground">
                      You {formatRatePct(data.personalRate)}
                    </span>
                  </div>
                )}
              </div>
              <div className="relative mt-9 h-4 text-[10px] text-muted-foreground/70 numeric">
                {ticks.map((t) => (
                  <span key={t} className="absolute -translate-x-1/2" style={{ left: `${(t / top) * 100}%` }}>{t}%</span>
                ))}
              </div>
            </div>
          )}

          {atMine && !today.isZero() && (
            <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-pretty">
              The <span className="numeric font-medium">{inr(today)}</span> you spend a year today becomes{' '}
              <span className="numeric font-semibold">{inr(atMine)}</span> in {horizon} years
              {extra && !extra.abs().lessThan(1) && (
                <>
                  , <span className={cn('numeric font-medium', extra.greaterThan(0) ? 'text-warning' : 'text-positive')}>
                    {inr(extra.abs())} {extra.greaterThan(0) ? 'more' : 'less'}
                  </span>{' '}
                  than official CPI would suggest
                </>
              )}
              .
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 lg:block lg:space-y-3 lg:border-l lg:pl-7">
          <div>
            <label htmlFor="pi-state" className="text-xs text-muted-foreground">Where you live</label>
            <Select id="pi-state" className="mt-1" value={data.profile.stateCode} disabled={saving}
              onChange={(e) => onProfile({ stateCode: Number.parseInt(e.target.value, 10), sector: data.profile.sector })}>
              {CPI_STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
            </Select>
          </div>
          <div>
            <label htmlFor="pi-sector" className="text-xs text-muted-foreground">Area</label>
            <Select id="pi-sector" className="mt-1" value={data.profile.sector} disabled={saving}
              onChange={(e) => onProfile({ stateCode: data.profile.stateCode, sector: e.target.value as CpiSector })}>
              {CPI_SECTORS.map((s) => <option key={s} value={s}>{CPI_SECTOR_LABELS[s]}</option>)}
            </Select>
          </div>
          <p className="col-span-2 text-[11px] leading-relaxed text-muted-foreground pt-1">
            Official figures come from the Ministry of Statistics (MoSPI) Consumer Price Index
            {asOf && <>, latest month {asOf}</>}. Checked daily.
          </p>
        </div>
      </div>
    </section>
  );
}
