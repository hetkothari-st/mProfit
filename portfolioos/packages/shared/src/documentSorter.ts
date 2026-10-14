/** Shared shapes for the Documents sorter (docs/superpowers/specs/2026-10-14-document-sorter-design.md). */

export const DOC_TYPES = [
  'ITR',
  'FORM_16',
  'INCOME_CERTIFICATE',
  'BANK_STATEMENT',
  'SALARY_SLIP',
  'CAS',
  'CONTRACT_NOTE',
  'INSURANCE',
  'FD_CERTIFICATE',
  'ID_PROOF',
  'OTHER',
] as const;
export type SortDocType = (typeof DOC_TYPES)[number];

export const DOC_TYPE_LABEL: Record<SortDocType, string> = {
  ITR: 'ITR',
  FORM_16: 'Form 16',
  INCOME_CERTIFICATE: 'Income Certificate',
  BANK_STATEMENT: 'Bank Statement',
  SALARY_SLIP: 'Salary Slip',
  CAS: 'CAS',
  CONTRACT_NOTE: 'Contract Note',
  INSURANCE: 'Insurance',
  FD_CERTIFICATE: 'FD Certificate',
  ID_PROOF: 'ID Proof',
  OTHER: 'Other',
};

export type SortStatus = 'PROCESSING' | 'FILED' | 'NEEDS_REVIEW' | 'NEEDS_PASSWORD' | 'FAILED';

export interface SorterFileDTO {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  docType: SortDocType | null;
  docDate: string | null; // YYYY-MM-DD
  sortStatus: SortStatus;
  sortReason: string | null;
  personId: string | null;
  createdAt: string;
}

export interface SorterPersonDTO {
  id: string;
  displayName: string;
  autoCreated: boolean;
  linkedUserId: string | null;
}

export interface SorterTreeDTO {
  people: Array<SorterPersonDTO & { types: Array<{ docType: SortDocType; files: SorterFileDTO[] }> }>;
  /** personId is null, or the file is not FILED yet (processing / needs review / failed). */
  unassigned: SorterFileDTO[];
}
