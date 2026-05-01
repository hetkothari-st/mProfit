import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: ReactNode;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
}

export function PageHeader({ title, description, actions, eyebrow }: PageHeaderProps) {
  return (
    <div className="mb-7 reveal">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-kerned text-accent-ink/85">
            {eyebrow ?? 'Portfolio'}
          </p>
          <h1 className="font-display mt-1.5 text-[44px] sm:text-[52px] leading-[1] tracking-[-0.012em] text-foreground text-balance">
            {title}
          </h1>
          {description && (
            <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-muted-foreground text-pretty">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2 self-start sm:self-end">
            {actions}
          </div>
        )}
      </div>
      <div className="mt-6 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
    </div>
  );
}
