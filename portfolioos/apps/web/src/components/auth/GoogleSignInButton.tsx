import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '@/api/auth.api';
import { useAuthStore } from '@/stores/auth.store';
import { apiErrorMessage } from '@/api/client';

/**
 * Google Identity Services (GSI) button.
 *
 * Renders the official "Sign in with Google" button via Google's loader
 * script (no npm dependency — we already pull GSI for Gmail OAuth in
 * other parts of the app). On credential response the idToken is POSTed
 * to /api/auth/google which verifies it server-side and issues our own
 * access/refresh tokens.
 *
 * Configure with VITE_GOOGLE_CLIENT_ID in the web app's environment.
 */

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            ux_mode?: 'popup' | 'redirect';
            auto_select?: boolean;
            use_fedcm_for_prompt?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              type?: 'standard' | 'icon';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
              logo_alignment?: 'left' | 'center';
              width?: number | string;
            },
          ) => void;
        };
      };
    };
  }
}

const GSI_SRC = 'https://accounts.google.com/gsi/client';

function loadGsiScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GSI_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('GSI load failed')));
      return;
    }
    const s = document.createElement('script');
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('GSI load failed'));
    document.head.appendChild(s);
  });
}

export interface GoogleSignInButtonProps {
  /** "signin" / "signup" / "continue" — controls button label only. */
  text?: 'signin_with' | 'signup_with' | 'continue_with';
}

export function GoogleSignInButton({ text = 'continue_with' }: GoogleSignInButtonProps) {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

  const googleMutation = useMutation({
    mutationFn: (idToken: string) => authApi.loginWithGoogle(idToken),
    onSuccess: (data) => {
      setSession(data.user, data.tokens);
      toast.success(
        data.isNew
          ? `Welcome to PortfolioOS, ${data.user.name.split(' ')[0]}!`
          : `Welcome back, ${data.user.name.split(' ')[0]}!`,
      );
      navigate('/dashboard', { replace: true });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Google sign-in failed')),
  });

  useEffect(() => {
    if (!clientId) {
      setLoadError('VITE_GOOGLE_CLIENT_ID is not set');
      return;
    }
    let cancelled = false;
    loadGsiScript()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const gsi = window.google?.accounts?.id;
        if (!gsi) {
          setLoadError('Google Identity Services unavailable');
          return;
        }
        gsi.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response?.credential) googleMutation.mutate(response.credential);
          },
          ux_mode: 'popup',
          auto_select: false,
        });
        gsi.renderButton(containerRef.current, {
          theme: 'outline',
          size: 'large',
          shape: 'rectangular',
          text,
          logo_alignment: 'left',
          width: containerRef.current.clientWidth || 320,
        });
      })
      .catch((err) => setLoadError(String(err?.message ?? err)));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, text]);

  if (!clientId) {
    return (
      <div className="text-xs text-muted-foreground text-center py-2 border rounded-md">
        Google sign-in unavailable (admin: set <span className="font-mono">VITE_GOOGLE_CLIENT_ID</span>).
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="flex justify-center min-h-[40px]" />
      {loadError && (
        <p className="text-xs text-negative text-center">{loadError}</p>
      )}
      {googleMutation.isPending && (
        <p className="text-xs text-muted-foreground text-center">Signing in…</p>
      )}
    </div>
  );
}
