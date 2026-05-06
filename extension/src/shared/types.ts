/**
 * types.ts — Shared types for the PortfolioOS browser extension.
 *
 * RawScrapePayload mirrors packages/api/src/adapters/pf/types.ts.
 * If the server type changes, update this mirror too.
 * Server canonical: portfolioos/packages/api/src/adapters/pf/types.ts
 */

export interface PfMemberPayload {
  memberId?: string;
  accountIdentifier?: string;
  establishmentName?: string;
  establishmentCode?: string;
  dateOfJoining?: string;
  dateOfExit?: string;
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

// ---------------------------------------------------------------------------
// Message types (content script ↔ background ↔ popup)
// ---------------------------------------------------------------------------

export type ExtensionMessage =
  | { kind: 'pair'; code: string }
  | { kind: 'status' }
  | { kind: 'submit-payload'; accountId?: string; payload: RawScrapePayload }
  | { kind: 'revoke' };

export type ExtensionResponse =
  | { ok: true; userId?: string; paired?: boolean; sessionId?: string; eventsCreated?: number }
  | { ok: false; error: string };
