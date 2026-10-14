/**
 * AI Connector (bring your own ChatGPT / Claude over MCP).
 * Spec: docs/superpowers/specs/2026-10-14-ai-connector-design.md.
 * Area ids double as OAuth scopes (`area:<id>`).
 */
export const AI_CONNECTOR_AREAS = [
  'investments', 'retirement', 'banking', 'loans', 'insurance', 'property',
  'vehicles', 'goals_tax', 'split', 'will', 'documents',
] as const;

export type AiConnectorArea = (typeof AI_CONNECTOR_AREAS)[number];

export const AI_CONNECTOR_AREA_INFO: Record<AiConnectorArea, { label: string; description: string; defaultOn: boolean }> = {
  investments: { label: 'Investments', description: 'Portfolios, holdings, transactions, returns, capital gains, foreign currency.', defaultOn: true },
  retirement: { label: 'Retirement', description: 'EPF, PPF and NPS accounts and balances.', defaultOn: true },
  banking: { label: 'Banking and cards', description: 'Bank balances, credit cards and income.', defaultOn: true },
  loans: { label: 'Loans', description: 'Loans you have taken and money you have lent.', defaultOn: true },
  insurance: { label: 'Insurance', description: 'Policies, cover, premiums and claims.', defaultOn: true },
  property: { label: 'Property', description: 'Homes, land and rentals, rent and expenses.', defaultOn: true },
  vehicles: { label: 'Vehicles', description: 'Vehicle values, expiry dates and challans.', defaultOn: true },
  goals_tax: { label: 'Goals and tax', description: 'Goal progress and tax summaries.', defaultOn: true },
  split: { label: 'Split expenses', description: 'Who owes whom in your groups.', defaultOn: true },
  will: { label: 'Will and succession', description: 'Your will summary and nominees.', defaultOn: false },
  documents: { label: 'Documents', description: 'The list of documents in your vault (names and dates, never file contents).', defaultOn: false },
};

export function isAiConnectorArea(x: unknown): x is AiConnectorArea {
  return typeof x === 'string' && (AI_CONNECTOR_AREAS as readonly string[]).includes(x);
}

const CLIENT_NAMES: Record<string, string> = {
  'chatgpt.com': 'ChatGPT',
  'chat.openai.com': 'ChatGPT',
  'claude.ai': 'Claude',
  'claude.com': 'Claude',
};

/** The name users see is derived from where the code is sent, never from what the client calls itself. */
export function clientDisplayName(redirectHost: string): string {
  return CLIENT_NAMES[redirectHost.toLowerCase()] ?? redirectHost.toLowerCase();
}

/**
 * Which family-visibility categories gate each area when a family member's
 * data is read (FamilyMember.visibleCategories / visibleAssetClasses).
 * 'ASSET_CLASSES' = gated by asset class; null = no family token exists, so
 * only the user and their managed profiles can be read for that area.
 */
export const AREA_CATEGORY: Record<AiConnectorArea, readonly string[] | 'ASSET_CLASSES' | null> = {
  investments: 'ASSET_CLASSES',
  retirement: 'ASSET_CLASSES',
  banking: ['BANK_ACCOUNT', 'CREDIT_CARD'],
  loans: ['LOAN'],
  insurance: ['INSURANCE'],
  property: ['OWNED_PROPERTY', 'RENTAL'],
  vehicles: ['VEHICLE'],
  goals_tax: ['GOAL'],
  split: null,
  will: null,
  documents: null,
};

/** A family member the user may share with a chatbot (approval page). */
export interface AiConnectorMemberWire {
  userId: string;
  name: string;
  relation: string;
  kind: 'managed' | 'member';
  shareable: boolean;
  reason?: string;
}

/** GET /api/connect/requests/:reqId */
export interface AiConnectorAuthRequestWire {
  reqId: string;
  clientName: string;
  redirectHost: string;
  /** ISO timestamp. */
  expiresAt: string;
  /** Areas already shared when this client is already connected, else null. */
  currentAreas: AiConnectorArea[] | null;
  /** Members already shared when this client is already connected, else null. */
  currentMemberIds: string[] | null;
  members: AiConnectorMemberWire[];
}

/** POST /api/connect/requests/:reqId/decision */
export interface AiConnectorDecisionResultWire {
  redirectTo: string;
}

/** GET /api/connect/connections */
export interface AiConnectionWire {
  id: string;
  clientName: string;
  /** dd/mm/yyyy */
  connectedOn: string;
  /** ISO timestamp or null. */
  lastUsedAt: string | null;
  areas: AiConnectorArea[];
  memberUserIds: string[];
}

/** GET /api/connect/connections/:id/activity - the chatbot's last 20 lookups. */
export interface AiConnectionActivityWire {
  tool: string;
  area: string;
  people: number;
  rows: number;
  ok: boolean;
  /** ISO timestamp. */
  at: string;
}
