import * as React from 'react';

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0–100 */
  value?: number;
}

export function Progress({ value = 0, className, ...props }: ProgressProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={`h-2 w-full overflow-hidden rounded-full bg-muted ${className ?? ''}`}
      {...props}
    >
      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}
