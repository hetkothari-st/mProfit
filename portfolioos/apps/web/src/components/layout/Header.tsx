import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, User, ChevronDown } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { authApi } from '@/api/auth.api';
import { cn } from '@/lib/cn';

export function Header() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { user, refreshToken, clearSession } = useAuthStore();

  const handleLogout = async () => {
    try {
      await authApi.logout(refreshToken);
    } catch {
      /* ignore */
    }
    clearSession();
    navigate('/login', { replace: true });
  };

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
                onClick={() => {
                  setOpen(false);
                  navigate('/settings');
                }}
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
    </header>
  );
}
