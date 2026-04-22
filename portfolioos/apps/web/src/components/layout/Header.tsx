import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogOut, User, ChevronDown, Sun, Moon, Bell } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeStore } from '@/stores/theme.store';
import { authApi } from '@/api/auth.api';
import { alertsApi } from '@/api/alerts.api';
import { cn } from '@/lib/cn';

export function Header() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { user, refreshToken, clearSession } = useAuthStore();
  const { dark, toggle } = useThemeStore();

  const handleLogout = async () => {
    // eslint-disable-next-line portfolioos/no-silent-catch -- best-effort revoke
    try { await authApi.logout(refreshToken); } catch { /* ignore */ }
    clearSession();
    navigate('/login', { replace: true });
  };

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['alerts-unread'],
    queryFn: () => alertsApi.getUnreadCount(),
    refetchInterval: 5 * 60 * 1000, // poll every 5 min
  });

  const initials = (user?.name ?? 'U')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="h-16 border-b bg-card flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-3">
        <h1 className="text-sm text-muted-foreground">Welcome back,</h1>
        <span className="font-medium">{user?.name ?? 'Investor'}</span>
      </div>

      <div className="flex items-center gap-2">
        {/* Alerts bell */}
        <Link
          to="/alerts"
          title="Alerts & Reminders"
          className="relative h-9 w-9 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center tabular-nums">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Link>

        {/* Dark mode toggle */}
        <button
          type="button"
          onClick={toggle}
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="h-9 w-9 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {/* User dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              'flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted transition-colors',
            )}
          >
            <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs font-semibold">
              {initials}
            </div>
            <div className="hidden sm:flex flex-col items-start leading-tight">
              <span className="text-sm font-medium">{user?.name}</span>
              <span className="text-[11px] text-muted-foreground">{user?.email}</span>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>

          {open && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setOpen(false)}
                aria-hidden="true"
              />
              <div className="absolute right-0 mt-1 z-20 w-56 rounded-md border bg-popover text-popover-foreground shadow-md py-1">
                <button
                  type="button"
                  onClick={() => { setOpen(false); navigate('/settings'); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                >
                  <User className="h-4 w-4" /> Profile & Settings
                </button>
                <div className="border-t my-1" />
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-negative hover:bg-muted"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
