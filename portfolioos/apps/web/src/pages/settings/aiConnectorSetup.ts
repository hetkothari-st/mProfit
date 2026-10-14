/**
 * Where the user's chatbot connects. The API is a separate origin from this
 * SPA in production, so VITE_API_PUBLIC_URL must be set there; locally the
 * Vite proxy makes window.location.origin work.
 */
export function connectorUrl(): string {
  const base = (import.meta.env.VITE_API_PUBLIC_URL as string | undefined) || window.location.origin;
  return `${base.replace(/\/+$/, '')}/mcp`;
}

export type ConnectorApp = 'ChatGPT' | 'Claude';

export const SETUP: Record<ConnectorApp, { settingsUrl: string; steps: string[] }> = {
  ChatGPT: {
    settingsUrl: 'https://chatgpt.com/#settings/Connectors',
    steps: [
      'In ChatGPT, open Settings > Apps & Connectors and choose to add a custom connector (developer mode may need to be on).',
      'Paste the address we copied for you and name it EveryPaisa.',
      'Click Connect, sign in to EveryPaisa if asked, choose what to share and Approve.',
    ],
  },
  Claude: {
    settingsUrl: 'https://claude.ai/settings/connectors',
    steps: [
      'In Claude, open Settings > Connectors and choose Add custom connector.',
      'Paste the address we copied for you and name it EveryPaisa.',
      'Click Connect, sign in to EveryPaisa if asked, choose what to share and Approve.',
    ],
  },
};
