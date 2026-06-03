/**
 * Finfactor (WealthScape) HTTP client.
 *
 * Finfactor is our Account Aggregator partner; its FIU APIs power the
 * "Auto-import via Finvu" flow on the Mutual Funds page. The client is
 * deliberately thin — Bearer-auth wrapper around the documented
 * /pfm/api/v2/* endpoints, no business logic.
 *
 * Sandbox UAT: https://dhanaprayoga.fiu.finfactor.in
 *
 * Auth: a long-lived FIU channel token (issued by Finfactor onboarding)
 * is sent verbatim as `Authorization: Bearer <token>` on every call. The
 * token comes from FINFACTOR_API_TOKEN; if absent the client throws
 * before issuing the request so we never silently leak a misconfigured
 * deploy as a 401.
 *
 * undici is used directly (rather than axios) to stay consistent with
 * the other outbound connectors in this package.
 */

import { request } from 'undici';
import { BadRequestError } from '../../lib/errors.js';

const DEFAULT_BASE_URL = 'https://dhanaprayoga.fiu.finfactor.in';
const DEFAULT_TIMEOUT_MS = 20_000;

export function finfactorBaseUrl(): string {
  return process.env['FINFACTOR_BASE_URL'] ?? DEFAULT_BASE_URL;
}

export function isFinfactorConfigured(): boolean {
  return Boolean(process.env['FINFACTOR_API_TOKEN']);
}

function getToken(): string {
  const token = process.env['FINFACTOR_API_TOKEN'];
  if (!token) {
    throw new BadRequestError(
      'FINFACTOR_API_TOKEN is not configured. Set it in the API env to enable Account Aggregator sync.',
    );
  }
  return token;
}

export class FinfactorUpstreamError extends Error {
  statusCode: number;
  payload: unknown;
  constructor(statusCode: number, payload: unknown, message: string) {
    super(message);
    this.name = 'FinfactorUpstreamError';
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

/**
 * POST <baseUrl><path> with the standard Bearer + JSON headers. Returns
 * the parsed JSON body. Throws FinfactorUpstreamError for non-2xx so
 * controller layer can surface upstream errors to the operator without
 * eating the diagnostic.
 */
export async function finfactorPost<TBody, TResp>(
  path: string,
  body: TBody,
): Promise<TResp> {
  const url = `${finfactorBaseUrl()}${path}`;
  const res = await request(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
    headersTimeout: DEFAULT_TIMEOUT_MS,
    bodyTimeout: DEFAULT_TIMEOUT_MS,
  });
  const text = await res.body.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (res.statusCode < 200 || res.statusCode >= 300) {
    const msg = (() => {
      if (parsed && typeof parsed === 'object' && parsed !== null) {
        const m = (parsed as Record<string, unknown>)['message'];
        if (typeof m === 'string') return m;
      }
      return `Finfactor ${path} returned ${res.statusCode}`;
    })();
    throw new FinfactorUpstreamError(res.statusCode, parsed, msg);
  }
  return parsed as TResp;
}
