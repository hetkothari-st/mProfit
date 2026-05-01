import { env } from '../config/env.js';
import { logger } from './logger.js';

// Typed wrapper around api.casparser.in.
// Auth: x-api-key header. All requests POST.
// Docs: https://casparser.in/docs/api-reference/introduction
//
// Endpoints used:
//   POST /v4/cdsl/fetch                          — request OTP for CDSL CAS
//   POST /v4/cdsl/fetch/:session_id/verify       — submit OTP, get CAS JSON
//   POST /v4/kfintech/generate                   — KFintech mailback (PAN+email → email)
//   POST /v4/smart/parse                         — parse uploaded CAS PDF
//   POST /v1/credits                             — check remaining credits

export class CasparserError extends Error {
  status: number;
  code: string;
  body: unknown;
  constructor(status: number, code: string, message: string, body?: unknown) {
    super(message);
    this.name = 'CasparserError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

function apiKey(): string {
  if (!env.CASPARSER_API_KEY) {
    throw new CasparserError(500, 'CASPARSER_NOT_CONFIGURED', 'CASPARSER_API_KEY not set in env');
  }
  return env.CASPARSER_API_KEY;
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const url = `${env.CASPARSER_BASE_URL}${path}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000); // 60s — CAS gen can be slow
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body ?? {}),
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const msg =
      err instanceof Error
        ? err.name === 'AbortError'
          ? 'casparser.in request timed out (60s) — try again'
          : `casparser.in network error: ${err.message}`
        : 'casparser.in unreachable';
    logger.warn({ url, err }, '[casparser] fetch failed');
    throw new CasparserError(0, 'CASPARSER_NETWORK', msg);
  }
  clearTimeout(timer);
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    let errMsg: string;
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      errMsg =
        (typeof obj.message === 'string' && obj.message) ||
        (typeof obj.msg === 'string' && obj.msg) ||
        (typeof obj.error === 'string' && obj.error) ||
        `HTTP ${res.status}`;
    } else {
      errMsg = `HTTP ${res.status}`;
    }
    if (res.status === 401 || res.status === 403) {
      errMsg = `CASParser auth rejected (${res.status}) — check CASPARSER_API_KEY in .env. Server says: ${errMsg}`;
    } else if (res.status === 429) {
      errMsg = `CASParser rate-limit hit. Server says: ${errMsg}`;
    } else if (res.status === 402) {
      errMsg = `CASParser credits exhausted. Top up at casparser.in. Server says: ${errMsg}`;
    }
    logger.warn({ url, status: res.status, body: parsed }, '[casparser] non-2xx response');
    throw new CasparserError(res.status, 'CASPARSER_API_ERROR', errMsg, parsed);
  }
  return parsed as T;
}

// ─── CDSL OTP Fetch (sync 2-step) ────────────────────────────────

export interface CdslFetchInitInput {
  pan: string;
  bo_id: string; // 16-digit CDSL Client ID (DP ID + Client ID concatenated)
  dob: string;   // YYYY-MM-DD
}

export interface CdslFetchInitResult {
  session_id: string;
  message?: string;
  otp_sent_to?: string;
  // Real schema may include other masked-contact fields
  [k: string]: unknown;
}

export async function cdslFetchInit(input: CdslFetchInitInput): Promise<CdslFetchInitResult> {
  return call<CdslFetchInitResult>('/v4/cdsl/fetch', input);
}

export interface CdslFetchVerifyInput {
  otp: string;
  num_periods?: number; // default 6 (monthly statements)
}

// Casparser unified-response shape (defensive — actual fields may vary).
export interface CasUnifiedResponse {
  meta?: Record<string, unknown>;
  investor?: {
    name?: string;
    pan?: string;
    email?: string;
    mobile?: string;
    address?: string;
    [k: string]: unknown;
  };
  summary?: Record<string, unknown>;
  demat_accounts?: Array<{
    dp_id?: string;
    dp_name?: string;
    bo_id?: string;
    holdings?: Array<DematHolding>;
    [k: string]: unknown;
  }>;
  mutual_funds?: Array<MfFolio>;
  insurance?: Array<unknown>;
  nps?: Array<unknown>;
  [k: string]: unknown;
}

export interface DematHolding {
  isin?: string;
  name?: string;
  units?: number | string;
  nav?: number | string;
  market_value?: number | string;
  [k: string]: unknown;
}

export interface MfFolio {
  folio?: string;
  amc?: string;
  schemes?: Array<MfScheme>;
  [k: string]: unknown;
}

export interface MfScheme {
  isin?: string;
  scheme?: string;
  type?: string;
  amfi?: string;
  open?: number | string;
  close?: number | string;
  close_calculated?: number | string;
  valuation?: { date?: string; nav?: number | string; value?: number | string };
  transactions?: Array<MfTxn>;
  [k: string]: unknown;
}

export interface MfTxn {
  date?: string; // YYYY-MM-DD
  description?: string;
  amount?: number | string;
  units?: number | string;
  nav?: number | string;
  balance?: number | string;
  type?: string; // PURCHASE | REDEMPTION | SWITCH_IN | SWITCH_OUT | DIVIDEND_PAYOUT | DIVIDEND_REINVEST | SIP | STAMP_DUTY | etc.
  dividend_rate?: number | string;
  [k: string]: unknown;
}

export async function cdslFetchVerify(
  sessionId: string,
  input: CdslFetchVerifyInput,
): Promise<CasUnifiedResponse> {
  const path = `/v4/cdsl/fetch/${encodeURIComponent(sessionId)}/verify`;
  return call<CasUnifiedResponse>(path, input);
}

// ─── KFintech mailback (async) ───────────────────────────────────

export interface KfintechGenerateInput {
  pan: string;
  email: string;
  from_date?: string;
  to_date?: string;
  password?: string; // password to encrypt the resulting PDF; default: PAN
}

export interface KfintechGenerateResult {
  message?: string;
  request_id?: string;
  [k: string]: unknown;
}

export async function kfintechGenerate(input: KfintechGenerateInput): Promise<KfintechGenerateResult> {
  return call<KfintechGenerateResult>('/v4/kfintech/generate', input);
}

// ─── Smart parse (uploaded PDF → JSON) ───────────────────────────
// Note: this endpoint expects multipart/form-data with a `file` field.
// Implement when needed.

// ─── Credits check ───────────────────────────────────────────────

export interface CreditsResult {
  credits_remaining?: number;
  credits_total?: number;
  plan?: string;
  [k: string]: unknown;
}

export async function getCredits(): Promise<CreditsResult> {
  return call<CreditsResult>('/v1/credits', {});
}
