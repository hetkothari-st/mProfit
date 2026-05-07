export const GmailScanStatus = {
  PENDING: 'PENDING',
  LISTING: 'LISTING',
  DOWNLOADING: 'DOWNLOADING',
  CLASSIFYING: 'CLASSIFYING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type GmailScanStatus = (typeof GmailScanStatus)[keyof typeof GmailScanStatus];

export const GmailDocStatus = {
  CLASSIFYING: 'CLASSIFYING',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  NOT_FINANCIAL: 'NOT_FINANCIAL',
  DUPLICATE: 'DUPLICATE',
  APPROVED: 'APPROVED',
  IMPORTING: 'IMPORTING',
  IMPORTED: 'IMPORTED',
  PARSE_FAILED: 'PARSE_FAILED',
  REJECTED: 'REJECTED',
} as const;
export type GmailDocStatus = (typeof GmailDocStatus)[keyof typeof GmailDocStatus];

export const GMAIL_DOC_STATUS_LABELS: Record<GmailDocStatus, string> = {
  CLASSIFYING: 'Classifying',
  PENDING_APPROVAL: 'Pending review',
  NOT_FINANCIAL: 'Not financial',
  DUPLICATE: 'Already imported',
  APPROVED: 'Approved',
  IMPORTING: 'Importing',
  IMPORTED: 'Imported',
  PARSE_FAILED: 'Parse failed',
  REJECTED: 'Rejected',
};

export const INBOX_DOC_TYPES = [
  'CONTRACT_NOTE',
  'CAS',
  'BANK_STATEMENT',
  'CC_STATEMENT',
  'FD_CERTIFICATE',
  'INSURANCE',
  'MF_STATEMENT',
  'SALARY_SLIP',
  'TAX_DOCUMENT',
  'OTHER',
  'NOT_FINANCIAL',
] as const;
export type InboxDocType = (typeof INBOX_DOC_TYPES)[number];

export interface GmailScanJobDTO {
  id: string;
  userId: string;
  mailboxId: string;
  lookbackFrom: string;
  lookbackTo: string;
  status: GmailScanStatus;
  totalMessages: number | null;
  processedMessages: number;
  attachmentsFound: number;
  attachmentsClassified: number;
  attachmentsKept: number;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface GmailDiscoveredDocDTO {
  id: string;
  scanJobId: string;
  gmailMessageId: string;
  gmailAttachmentId: string;
  fromAddress: string;
  subject: string;
  receivedAt: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  isFinancial: boolean | null;
  classifiedDocType: InboxDocType | null;
  classifierConfidence: string | null;
  classifierNotes: string | null;
  status: GmailDocStatus;
  importJobId: string | null;
  rejectedReason: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  importedAt: string | null;
  createdAt: string;
}

export interface GmailAutoApproveRuleDTO {
  id: string;
  fromAddress: string;
  docType: string | null;
  enabled: boolean;
  approvedCount: number;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CreateScanJobInput {
  lookbackFrom: string;
  lookbackTo: string;
}

export interface BulkApproveInput {
  ids: string[];
  createAutoApproveRule?: boolean;
}

export interface BulkRejectInput {
  ids: string[];
  reason?: string;
  blocklist?: boolean;
}
