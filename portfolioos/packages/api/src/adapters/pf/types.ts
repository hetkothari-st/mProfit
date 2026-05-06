import type {
  ProvidentFundAccount,
  PfFetchStatus,
  PfInstitution,
  PfType,
} from '@prisma/client';

export interface PfMemberPayload {
  memberId?: string;
  accountIdentifier?: string;
  establishmentName?: string;
  establishmentCode?: string;
  dateOfJoining?: string;
  dateOfExit?: string;
  passbookPdf?: { base64: string; sha256: string };
  htmlSnapshots?: Array<{ url: string; html: string }>;
  structuredRows?: Array<{
    date: string;
    type: string;
    amount: string;
    balance?: string;
    raw: string;
  }>;
}

export interface RawScrapePayload {
  adapterId: string;
  adapterVersion: string;
  capturedAt: string;
  members: PfMemberPayload[];
}

export type ParseResult<T> =
  | { ok: true; events: T[]; metadata?: Record<string, unknown> }
  | { ok: false; error: string; rawPayload?: unknown };

export interface PfCanonicalEventInput {
  type: string;             // CanonicalEventType
  eventDate: string;        // YYYY-MM-DD
  amount: string;           // Decimal string
  memberIdLast4?: string;
  notes?: string;
  sequence: number;
}

export interface ScrapeContext {
  sessionId: string;
  account: ProvidentFundAccount;
  credentials?: { username: string; password: string; mpin?: string };
  prompt: {
    askCaptcha(imgBytes: Buffer): Promise<string>;
    askOtp(channel: 'sms' | 'email'): Promise<string>;
    askText(label: string): Promise<string>;
  };
  emit(status: PfFetchStatus, info?: Record<string, unknown>): void;
  abortSignal: AbortSignal;
}

export interface PfAdapter {
  id: string;
  version: string;
  institution: PfInstitution;
  type: PfType;
  hostnames: string[];
  scrape(ctx: ScrapeContext): Promise<RawScrapePayload>;
  parse(raw: RawScrapePayload): Promise<ParseResult<PfCanonicalEventInput>>;
}
