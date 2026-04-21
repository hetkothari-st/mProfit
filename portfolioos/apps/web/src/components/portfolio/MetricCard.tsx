import type { LucideIcon } from 'lucide-react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
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

export function MetricCard({ label, value, icon: Icon, trend, hint }: MetricCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="numeric mt-2 text-2xl font-semibold">{value}</div>
          {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
        </div>
        {Icon && (
          <div className="h-9 w-9 rounded-md bg-muted grid place-items-center">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </div>
      {trend && (
        <div
          className={cn(
            'mt-3 inline-flex items-center gap-1 text-xs font-medium rounded px-2 py-0.5',
            trend.direction === 'up' && 'bg-positive/10 text-positive',
            trend.direction === 'down' && 'bg-negative/10 text-negative',
            trend.direction === 'flat' && 'bg-muted text-muted-foreground',
          )}
        >
          {trend.direction === 'up' && <ArrowUp className="h-3 w-3" />}
          {trend.direction === 'down' && <ArrowDown className="h-3 w-3" />}
          <span className="numeric">{trend.value}</span>
        </div>
      )}
    </Card>
  );
}
