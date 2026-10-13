import type { WillEstate, WillPayload, WillRelationship } from './schema.js';
import type { WillBlock } from './ast.js';

export type WillSeverity = 'BLOCKER' | 'WARNING' | 'INFO';

export interface WillFinding {
  ruleId: string;
  severity: WillSeverity;
  /** Wizard step the finding belongs to (2-8). */
  step: number;
  /** Fixed, PII-free sentence. */
  message: string;
  /** Person ids or item sourceKeys to highlight. */
  refs: string[];
}

export type WillStatusWire = 'DRAFT' | 'GENERATED' | 'EXECUTED' | 'SUPERSEDED' | 'DISCARDED';
export type WillOverallStatus = 'NOT_CREATED' | 'DRAFT' | 'GENERATED' | 'EXECUTED';

export interface WillVersionWire {
  id: string;
  willId: string;
  versionNo: number;
  status: WillStatusWire;
  generatedOn: string;
  templateId: string;
  templateVersion: number;
}

export interface WillEstateTotalsWire {
  assets: string;
  liabilities: string;
  net: string;
  nomineeOnly: string;
}

export interface WillDraftSummaryWire {
  id: string;
  version: number;
  currentStep: number;
  updatedAt: string;
}

/** One will in the overview's history (every status except DISCARDED). */
export interface WillHistoryEntryWire {
  willId: string;
  version: number;
  status: WillStatusWire;
  createdOn: string;
  generatedOn: string | null;
  executedOn: string | null;
  /** Only for the EXECUTED will. */
  nextReviewAt: string | null;
  supersededByVersion: number | null;
  versionId: string | null;
  hasSignedCopy: boolean;
}

/** The executed will's review date; `due` once it is today or past. */
export interface WillReviewWire {
  willId: string;
  version: number;
  nextReviewAt: string;
  due: boolean;
}

export interface WillOverviewWire {
  status: WillOverallStatus;
  draft: WillDraftSummaryWire | null;
  versions: WillVersionWire[];
  estate: WillEstateTotalsWire;
  estateFailedSources: string[];
  history: WillHistoryEntryWire[];
  review: WillReviewWire | null;
}

export interface WillDraftWire {
  id: string;
  version: number;
  revision: number;
  currentStep: number;
  payload: WillPayload;
  findings: WillFinding[];
  updatedAt: string;
}

export interface WillSaveResultWire {
  revision: number;
  updatedAt: string;
}

export interface WillEstateRefreshWire {
  revision: number;
  estate: WillEstate;
}

export interface WillSuggestionWire {
  userId: string;
  name: string;
  relation: string | null;
  relationship: WillRelationship | null;
  dob: string | null;
}

export interface WillPreviewWire {
  templateId: string;
  templateVersion: number;
  generatedOn: string;
  summary: WillBlock[];
  document: WillBlock[];
}

export interface WillGenerateResultWire {
  version: WillVersionWire;
}

export const WILL_DISCLAIMER =
  'This is not legal advice. Passing these checks does not guarantee that your will is legally valid. Get it reviewed by a qualified advocate before you sign it.';

export const WILL_ACKNOWLEDGEMENT =
  'I understand that EveryPaisa is not a law firm, that this will is produced from a fixed template, and that I should have it reviewed by a qualified advocate before I sign it.';

export const WILL_PDF_FOOTER =
  'Prepared with EveryPaisa Will Maker from a fixed template. Not legal advice - have it reviewed by a qualified advocate.';
