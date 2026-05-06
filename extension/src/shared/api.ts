/**
 * api.ts — Fetch wrapper for PortfolioOS extension API calls.
 *
 * All network calls go through this module. Extension code (content scripts,
 * popup) sends messages to the background service worker which is the only
 * place that calls these functions — this avoids CORS issues and keeps the
 * bearer token in one place.
 */

import { getApiBase, getBearer } from './storage.js';
import type { RawScrapePayload } from './types.js';

type FetchInit = RequestInit & { auth?: boolean };

async function call<T>(path: string, init: FetchInit = {}): Promise<T> {
  const base = await getApiBase();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.auth !== false) {
    const bearer = await getBearer();
    if (bearer) headers['Authorization'] = `Bearer ${bearer}`;
  }
  const r = await fetch(`${base}/api/epfppf${path}`, { ...init, headers });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`API ${path} → ${r.status}: ${body}`);
  }
  return r.json() as Promise<T>;
}

export const extApi = {
  /**
   * Exchange a pairing code for a bearer token (no auth required).
   */
  pairComplete: (code: string) =>
    call<{ success: true; data: { bearer: string; userId: string } }>(
      '/extension/pair-complete',
      { method: 'POST', body: JSON.stringify({ code }), auth: false },
    ),

  /**
   * Verify the current bearer token is still valid.
   */
  me: () =>
    call<{ success: true; data: { userId: string; paired: boolean } }>('/extension/me'),

  /**
   * Post a raw scraped payload to the server for parsing + ingestion.
   */
  postRawPayload: (body: {
    accountId?: string;
    sessionId?: string;
    payload: RawScrapePayload;
  }) =>
    call<{ success: true; data: { sessionId: string; eventsCreated: number } }>(
      '/extension/raw-payload',
      { method: 'POST', body: JSON.stringify(body) },
    ),

  /**
   * Revoke this extension's bearer (called on uninstall or manual disconnect).
   */
  revoke: () =>
    call<{ success: true; data: { revoked: boolean } }>(
      '/extension/revoke',
      { method: 'POST' },
    ),
};
