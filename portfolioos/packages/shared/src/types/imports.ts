import type { ImportType, ImportStatus } from './enums.js';

export interface ImportJobDTO {
  id: string;
  userId: string;
  portfolioId: string | null;
  type: ImportType;
  status: ImportStatus;
  fileName: string;
  filePath: string;
  broker: string | null;
  totalRows: number | null;
  successRows: number | null;
  failedRows: number | null;
  errorLog: {
    parser?: string;
    parserWarnings?: string[];
    rowErrors?: { row: number; reason: string }[];
    skippedAsDuplicates?: number;
    general?: string;
  } | null;
  contentHash: string | null;
  gmailMessageId: string | null;
  createdAt: string;
  completedAt: string | null;
  _count?: { transactions: number };
}

export interface ImportCreateResponse {
  id: string;
  status: ImportStatus;
  type: ImportType;
  fileName: string;
  createdAt: string;
}

export const IMPORT_TYPE_LABELS: Record<ImportType, string> = {
  CONTRACT_NOTE_PDF: 'Contract Note (PDF)',
  CONTRACT_NOTE_EXCEL: 'Contract Note (Excel)',
  CONTRACT_NOTE_HTML: 'Contract Note (HTML)',
  MF_CAS_PDF: 'MF CAS (PDF)',
  MF_CAS_EXCEL: 'MF CAS (Excel)',
  BACK_OFFICE_CSV: 'Broker Back-Office CSV',
  BANK_STATEMENT_PDF: 'Bank Statement (PDF)',
  BANK_STATEMENT_CSV: 'Bank Statement (CSV)',
  NPS_STATEMENT: 'NPS Statement',
  GENERIC_CSV: 'Generic CSV',
  GENERIC_EXCEL: 'Generic Excel',
};

export const IMPORT_STATUS_LABELS: Record<ImportStatus, string> = {
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  COMPLETED: 'Completed',
  COMPLETED_WITH_ERRORS: 'Partial',
  FAILED: 'Failed',
};
