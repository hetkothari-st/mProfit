import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <Link to="/" className="flex items-center justify-center gap-2 mb-8">
            <div className="h-10 w-10 rounded-md bg-primary grid place-items-center text-primary-foreground font-bold text-lg">
              P
            </div>
            <span className="text-xl font-semibold tracking-tight text-primary">
              PortfolioOS
            </span>
          </Link>

          <div className="rounded-lg border bg-card p-8 shadow-sm">
            <div className="mb-6">
              <h1 className="text-2xl font-semibold">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            {children}
          </div>

          {footer && <div className="text-center mt-6 text-sm">{footer}</div>}
        </div>
      </div>

      <footer className="py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} PortfolioOS · Multi-asset portfolio management for India
      </footer>
    </div>
  );
}
