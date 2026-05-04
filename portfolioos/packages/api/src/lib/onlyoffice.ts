/**
 * OnlyOffice DocumentServer integration helpers.
 *
 * - Sign + verify JWTs that DocumentServer expects/sends.
 * - Map our internal `mimeType`/extension to the editor's `documentType` and
 *   `fileType` parameters.
 * - Build editor config payloads (file URL DocServer downloads from, save
 *   callback URL DocServer POSTs back to).
 *
 * Save flow:
 *   1. User opens our editor page → API issues JWT-signed config →
 *      browser loads OnlyOffice iframe with config + token.
 *   2. DocServer downloads file from `document.url` (our authed download
 *      endpoint, with a short-lived signed token).
 *   3. User edits and clicks save (or closes editor).
 *   4. DocServer POSTs callback with `status: 2` (ready) and `url` to
 *      fetch the new bytes from.
 *   5. API downloads from that URL, replaces stored bytes, bumps
 *      externalEditKey.
 */

import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export type OnlyOfficeDocType = 'word' | 'cell' | 'slide' | 'pdf';

const EXT_TO_DOCTYPE: Record<string, OnlyOfficeDocType> = {
  doc: 'word',
  docx: 'word',
  odt: 'word',
  rtf: 'word',
  txt: 'word',
  xls: 'cell',
  xlsx: 'cell',
  ods: 'cell',
  csv: 'cell',
  ppt: 'slide',
  pptx: 'slide',
  odp: 'slide',
  pdf: 'pdf',
};

const EDITABLE_TYPES = new Set([
  'docx',
  'odt',
  'rtf',
  'txt',
  'xlsx',
  'ods',
  'csv',
  'pptx',
  'odp',
]);

export function fileExtFromName(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m?.[1] ?? '';
}

export function detectDocType(fileName: string): OnlyOfficeDocType | null {
  const ext = fileExtFromName(fileName);
  return EXT_TO_DOCTYPE[ext] ?? null;
}

export function isEditable(fileName: string): boolean {
  return EDITABLE_TYPES.has(fileExtFromName(fileName));
}

const JWT_OPTS: jwt.SignOptions = { expiresIn: '24h', algorithm: 'HS256' };

export function signOOPayload<T extends object>(payload: T): string {
  return jwt.sign(payload, env.ONLYOFFICE_JWT_SECRET, JWT_OPTS);
}

export function verifyOOPayload(token: string): unknown {
  return jwt.verify(token, env.ONLYOFFICE_JWT_SECRET, { algorithms: ['HS256'] });
}

export interface BuildConfigInput {
  documentId: string;
  fileName: string;
  fileType: string; // extension w/o dot
  externalEditKey: string;
  fileDownloadUrl: string; // URL DocServer fetches from (authed via signed token query param)
  callbackUrl: string; // URL DocServer POSTs to on save
  userId: string;
  userName: string;
  readOnly?: boolean;
}

export function buildEditorConfig(input: BuildConfigInput) {
  const docType = EXT_TO_DOCTYPE[input.fileType] ?? 'word';
  const config = {
    document: {
      fileType: input.fileType,
      key: input.externalEditKey,
      title: input.fileName,
      url: input.fileDownloadUrl,
      permissions: {
        edit: !input.readOnly && EDITABLE_TYPES.has(input.fileType),
        download: true,
        print: true,
        review: true,
        comment: true,
      },
    },
    documentType: docType,
    editorConfig: {
      callbackUrl: input.callbackUrl,
      mode: input.readOnly ? 'view' : 'edit',
      lang: 'en',
      user: { id: input.userId, name: input.userName },
      customization: {
        autosave: true,
        forcesave: true,
        compactHeader: false,
        toolbarNoTabs: false,
      },
    },
    type: 'desktop',
  };
  const token = signOOPayload(config);
  return { ...config, token };
}

export async function convertToPdf(input: {
  fileUrl: string;
  fileType: string;
  key: string;
}): Promise<string> {
  const body = { async: false, filetype: input.fileType, outputtype: 'pdf', url: input.fileUrl, key: input.key };
  const token = signOOPayload(body);
  const res = await fetch(`${env.ONLYOFFICE_INTERNAL_URL}/ConvertService.ashx`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ...body, token }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OnlyOffice ConvertService ${res.status}: ${text.slice(0, 200)}`);
  }
  const raw = await res.text();
  let json: { fileUrl?: string; error?: number };
  try {
    json = JSON.parse(raw) as { fileUrl?: string; error?: number };
  } catch {
    throw new Error(`OnlyOffice returned non-JSON: ${raw.slice(0, 200)}`);
  }
  if (json.error) throw new Error(`OnlyOffice convert error code ${json.error}`);
  if (!json.fileUrl) throw new Error('OnlyOffice returned no fileUrl');
  return json.fileUrl;
}

export type CallbackPayload = {
  status: number;
  url?: string;
  key?: string;
  users?: string[];
  actions?: Array<{ type: number; userid: string }>;
};

// OnlyOffice callback statuses we care about:
//   1 — being edited
//   2 — ready for saving (collected force-saved version)
//   4 — closed without changes
//   6 — being edited but the document is being force-saved
//   7 — error force-saving
export function isSaveStatus(s: number): boolean {
  return s === 2 || s === 6;
}
