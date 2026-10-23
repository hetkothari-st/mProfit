import { getApiBaseUrl } from '@/api/baseUrl';

/**
 * Validation for the `broker_oauth_result` postMessage sent by the broker
 * login popup.
 *
 * The popup's last page is the API's `/api/fo/brokers/:id/callback`, which
 * posts `{ type: 'broker_oauth_result', payload }` to `window.opener`. Any
 * other window (an ad iframe, another tab that opened us, a malicious page
 * the user navigated the popup to) can post the same shape, so a listener
 * must check both where the message came from (origin = the API) and which
 * window sent it (the popup we opened). Anything else is ignored.
 */
export interface BrokerOauthResult {
  ok?: boolean;
  brokerId?: string;
  error?: string;
}

export function brokerCallbackOrigin(): string {
  return new URL(getApiBaseUrl()).origin;
}

export function readBrokerOauthMessage(
  ev: Pick<MessageEvent, 'origin' | 'source' | 'data'>,
  popup: Window | null | undefined,
  expectedOrigin: string = brokerCallbackOrigin(),
): BrokerOauthResult | null {
  if (ev.origin !== expectedOrigin) return null;
  if (!popup || ev.source !== popup) return null;
  const d = ev.data as { type?: unknown; payload?: unknown } | null | undefined;
  if (!d || typeof d !== 'object' || d.type !== 'broker_oauth_result') return null;
  const p = d.payload;
  if (!p || typeof p !== 'object') return {};
  const raw = p as Record<string, unknown>;
  return {
    ok: raw.ok === true,
    brokerId: typeof raw.brokerId === 'string' ? raw.brokerId : undefined,
    error: typeof raw.error === 'string' ? raw.error : undefined,
  };
}
