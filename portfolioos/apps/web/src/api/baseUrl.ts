// Resolves the API base URL.
// Priority: VITE_API_URL (build-time) → Railway production fallback → localhost dev.
export function getApiBaseUrl(): string {
  const fromEnv = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined' && /\.railway\.app$/.test(window.location.hostname)) {
    return 'https://mprofit-production.up.railway.app';
  }
  return 'http://localhost:3001';
}
