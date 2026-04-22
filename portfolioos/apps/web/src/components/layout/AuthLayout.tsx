import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { useThemeStore } from '@/stores/theme.store';

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  const { dark, toggle } = useThemeStore();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top-right theme toggle */}
      <div className="flex justify-end px-6 pt-4">
        <button
          type="button"
          onClick={toggle}
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="h-9 w-9 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 pb-10">
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
