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
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1 sm:basis-80">
          <p className="text-[10px] font-medium uppercase tracking-kerned text-accent-ink/85">
            {eyebrow ?? 'Portfolio'}
          </p>
          <h1 className="font-display mt-1.5 text-[clamp(28px,9vw,44px)] sm:text-[52px] leading-[1] tracking-[-0.012em] text-foreground text-balance break-words hyphens-auto">
            {title}
          </h1>
          {description && (
            <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-muted-foreground text-pretty">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:ml-auto sm:justify-end sm:self-end">
            {actions}
          </div>
        )}
      </div>
      <div className="mt-6 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
    </div>
  );
}
