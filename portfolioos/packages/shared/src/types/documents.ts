import type { WillDocumentTag } from '../will/execution.js';

export type DocumentOwnerType =
  | 'RENTAL_PROPERTY'
  | 'TENANCY'
  | 'VEHICLE'
  | 'INSURANCE_POLICY'
  | 'PORTFOLIO'
  | 'OWNED_PROPERTY'
  | 'LOAN_GIVEN'
  | 'WILL'
  | 'OTHER';

export interface DocumentDTO {
  id: string;
  ownerType: DocumentOwnerType;
  ownerId: string;
  category: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  externalEditKey: string;
  createdAt: string;
  updatedAt: string;
  /** WILL documents only: whether the will is still the live one, and how to label the file. */
  will?: WillDocumentTag | null;
}

export interface UpdateDocumentRequest {
  fileName?: string;
  category?: string | null;
}

// Subset of OnlyOffice DocsAPI editor config — fully typed only on the
// client where @onlyoffice/document-editor-react owns the schema.
export interface OnlyOfficeConfigResponse {
  config: Record<string, unknown> & { token?: string };
  docServerUrl: string;
}
