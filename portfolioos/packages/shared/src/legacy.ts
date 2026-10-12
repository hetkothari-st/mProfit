// Legacy Transfer (docs/legacy-transfer/01-DESIGN.md): constants and wire DTOs
// shared by the API and the web app.

export const LEGACY_CATEGORIES = [
  'INVESTMENTS', 'BANK_ACCOUNTS', 'INSURANCE', 'LIABILITIES',
  'PROPERTY', 'VEHICLES', 'RETIREMENT', 'DOCUMENTS', 'LETTER',
] as const;
export type LegacyCategory = (typeof LEGACY_CATEGORIES)[number];

export const LEGACY_MIN_INACTIVITY_DAYS = 30;
export const LEGACY_DEFAULT_INACTIVITY_DAYS = 90;
export const LEGACY_MAX_INACTIVITY_DAYS = 3650;
export const LEGACY_STAGE_DAYS = 7;
export const LEGACY_MAX_PAUSE_DAYS = 180;
export const LEGACY_SCHEDULE_REMINDER_DAYS = [30, 7, 1] as const;

export type LegacyStatusValue =
  | 'DRAFT' | 'ARMED' | 'WARNING_1' | 'WARNING_2' | 'FINAL_WARNING' | 'GRACE' | 'RELEASED' | 'PAUSED';
export type LegacyTriggerValue = 'INACTIVITY' | 'SCHEDULED' | 'BOTH';

export const LEGACY_CATEGORY_LABELS: Record<LegacyCategory, string> = {
  INVESTMENTS: 'Investments',
  BANK_ACCOUNTS: 'Bank accounts',
  INSURANCE: 'Insurance',
  LIABILITIES: 'Loans & credit cards',
  PROPERTY: 'Property',
  VEHICLES: 'Vehicles',
  RETIREMENT: 'Provident fund & NPS',
  DOCUMENTS: 'Documents',
  LETTER: 'Personal letter',
};

/** Generic Indian claim steps per category, shown to nominees. Information, not legal advice. */
export const LEGACY_CLAIM_CHECKLIST: Record<LegacyCategory, string[]> = {
  INVESTMENTS: [
    'Get several attested copies of the death certificate.',
    'For mutual funds, contact the registrar (CAMS or KFintech) with the transmission form, death certificate and your KYC.',
    'For shares, contact the depository participant (broker) that holds the demat account for transmission.',
  ],
  BANK_ACCOUNTS: [
    'Visit the branch with the death certificate, your ID and the claim form.',
    'If you are the registered nominee, the claim is usually settled without a succession certificate.',
  ],
  INSURANCE: [
    'Inform the insurer quickly; most have a claim intimation helpline.',
    'Submit the claim form, death certificate, policy document (or copy) and your ID and bank details.',
  ],
  LIABILITIES: [
    'Inform each lender in writing; ask whether a loan protection cover exists.',
    'Stop auto-debits only after the lender confirms the closure route.',
    'Ask card issuers to block cards and share the final statement.',
  ],
  PROPERTY: [
    'Collect the title documents and the latest tax receipts.',
    'Apply to the local authority / society for mutation in the legal heir’s name.',
  ],
  VEHICLES: [
    'Apply at the RTO for transfer of ownership on death (Form 31 or the state equivalent).',
    'Transfer or cancel the vehicle insurance.',
  ],
  RETIREMENT: [
    'EPF: file the claim (Form 20 / 10D / 5IF) through the employer or the EPFO portal.',
    'NPS: submit the death withdrawal form to the POP or CRA.',
  ],
  DOCUMENTS: ['Download and keep copies of the shared documents before access expires.'],
  LETTER: [],
};

export interface LegacyNomineeDTO {
  id: string;
  name: string;
  email: string;
  relationship: string;
  priority: number;
  isVerifier: boolean;
  categories: LegacyCategory[];
  documentIds: string[];
  showAmounts: boolean;
  acknowledgedAt: string | null;
}

export interface LegacyOverviewDTO {
  status: LegacyStatusValue;
  triggerMode: LegacyTriggerValue;
  inactivityDays: number;
  /** Admin-only: 1-minute inactivity and stages. */
  testMode: boolean;
  scheduledFor: string | null; // YYYY-MM-DD
  pausedUntil: string | null; // YYYY-MM-DD
  hasLetter: boolean;
  letter: string | null;
  activatedAt: string | null;
  releasedAt: string | null;
  lastActiveAt: string | null;
  /** Human sentence for the status card, e.g. "First warning on 12 Jan 2027 if you stay inactive." */
  nextEvent: string | null;
  nominees: LegacyNomineeDTO[];
  entitled: boolean;
}

export interface LegacyItemDTO {
  label: string;
  sublabel: string | null;
  identifierLast4: string | null;
  nominee: string | null;
  /** Decimal string, present only when the nominee may see amounts. */
  amount: string | null;
  notes: string[];
}

export interface LegacySectionDTO {
  category: LegacyCategory;
  title: string;
  items: LegacyItemDTO[];
  checklist: string[];
}

export interface LegacyViewDTO {
  ownerName: string;
  nomineeName: string;
  releasedAt: string;
  showAmounts: boolean;
  /** Decimal string; null when showAmounts is false. */
  netWorth: string | null;
  sections: LegacySectionDTO[];
  letter: string | null;
  documents: Array<{ id: string; fileName: string; category: string | null }>;
}
