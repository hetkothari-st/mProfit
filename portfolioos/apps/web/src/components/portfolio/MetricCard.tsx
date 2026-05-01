import type { LucideIcon } from 'lucide-react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Money } from '@/components/ui/money';
import { cn } from '@/lib/cn';

interface MetricCardProps {
  label: string;
  value: string;
  icon?: LucideIcon;
  trend?: {
    value: string;
    direction: 'up' | 'down' | 'flat';
  };
  hint?: string;
}

function looksLikeMoney(s: string) {
  return /[₹]|^Rs\.?/.test(s) || /^[+-]?[\d,]+(\.\d+)?$/.test(s);
}

export function MetricCard({ label, value, icon: Icon, trend, hint }: MetricCardProps) {
  const isMoney = looksLikeMoney(value);

  return (
    <Card className="group relative overflow-hidden p-5 hover:shadow-elev-lg transition-shadow">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-medium uppercase tracking-kerned text-muted-foreground">
            {label}
          </div>
          {isMoney ? (
            <Money
              className="numeric-display mt-3 text-[26px] leading-[1.05] tracking-tight text-foreground"
              symbolClassName="text-[0.66em] -translate-y-[0.14em] text-accent/85"
            >
              {value}
            </Money>
          ) : (
            <div className="numeric-display mt-3 text-[26px] leading-[1.05] tracking-tight text-foreground">
              {value}
            </div>
          )}
          {hint && (
            <div className="mt-1.5 text-[11.5px] text-muted-foreground">{hint}</div>
          )}
        </div>
        {Icon && (
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-border/70 bg-background/40">
            <Icon className="h-4 w-4 text-accent-ink" strokeWidth={1.6} />
          </div>
        )}
      </div>

      {trend && (
        <div
          className={cn(
            'mt-4 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
            trend.direction === 'up' && 'border-positive/30 bg-positive/10 text-positive',
            trend.direction === 'down' && 'border-negative/30 bg-negative/10 text-negative',
            trend.direction === 'flat' && 'border-border bg-muted/60 text-muted-foreground',
          )}
        >
          {trend.direction === 'up' && <ArrowUp className="h-3 w-3" strokeWidth={2.2} />}
          {trend.direction === 'down' && <ArrowDown className="h-3 w-3" strokeWidth={2.2} />}
          {trend.direction === 'flat' && <Minus className="h-3 w-3" strokeWidth={2.2} />}
          <span className="numeric">{trend.value}</span>
        </div>
      )}
    </Card>
  );
}
