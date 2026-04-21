import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from '../lib/response.js';
import { BadRequestError } from '../lib/errors.js';

/**
 * CAS (Consolidated Account Statement) helpers.
 *
 * CAMS and KFintech do not expose public APIs to request CAS. Both use a
 * web form and email the password-protected PDF to the investor's registered
 * email. Our mailbox poller auto-picks these up once an IMAP account is set.
 *
 * These endpoints return structured guidance + deep-link URLs so the frontend
 * can drive the flow without hardcoding URLs.
 */

const CAMS_CAS_URL =
  'https://www.camsonline.com/Investors/Statements/Consolidated-Account-Statement';
const KFINTECH_CAS_URL =
  'https://mfs.kfintech.com/investor/General/ConsolidatedAccountStatement';
const NSDL_ECAS_URL = 'https://nsdlcas.nsdl.com/';
const CDSL_ECAS_URL = 'https://www.cdslindia.com/CAS/LoginCAS.aspx';

export async function listCasProviders(_req: Request, res: Response) {
  ok(res, {
    providers: [
      {
        id: 'CAMS',
        name: 'CAMS',
        coverage: 'Mutual funds serviced by CAMS (~60% of MF industry)',
        url: CAMS_CAS_URL,
        passwordHint: 'PAN in uppercase',
        emailFromPattern: '@camsonline.com',
        subjectPattern: 'Consolidated Account Statement',
        notes:
          'Select "Detailed" statement and either "Specific Period" or "All Transactions". Email-based CAS arrives within a few minutes to the registered email.',
      },
      {
        id: 'KFINTECH',
        name: 'KFintech',
        coverage: 'Mutual funds serviced by KFintech (~40% of MF industry)',
        url: KFINTECH_CAS_URL,
        passwordHint: 'PAN in uppercase',
        emailFromPattern: '@kfintech.com',
        subjectPattern: 'Consolidated Account Statement',
        notes:
          'Provide PAN and email. Select "Detailed" statement type. Email arrives at registered email in a few minutes.',
      },
      {
        id: 'NSDL',
        name: 'NSDL (e-CAS)',
        coverage: 'Demat holdings + MF consolidated across NSDL',
        url: NSDL_ECAS_URL,
        passwordHint: 'PAN + DOB (DDMMYYYY)',
        emailFromPattern: '@nsdl.co.in',
        subjectPattern: 'e-CAS',
        notes: 'Combined depository + MF statement. Issued monthly.',
      },
      {
        id: 'CDSL',
        name: 'CDSL (e-CAS)',
        coverage: 'Demat holdings + MF consolidated across CDSL',
        url: CDSL_ECAS_URL,
        passwordHint: 'PAN',
        emailFromPattern: '@cdslindia.com',
        subjectPattern: 'e-CAS',
        notes: 'Combined depository + MF statement. Issued monthly.',
      },
    ],
  });
}

const BuildRequestSchema = z.object({
  provider: z.enum(['CAMS', 'KFINTECH', 'NSDL', 'CDSL']),
  pan: z.string().length(10).optional(),
  email: z.string().email().optional(),
  fromDate: z.string().optional(), // YYYY-MM-DD
  toDate: z.string().optional(),
  statementType: z.enum(['DETAILED', 'SUMMARY']).default('DETAILED'),
});

export async function buildCasRequest(req: Request, res: Response) {
  const body = BuildRequestSchema.parse(req.body);
  let portalUrl: string;
  switch (body.provider) {
    case 'CAMS':
      portalUrl = CAMS_CAS_URL;
      break;
    case 'KFINTECH':
      portalUrl = KFINTECH_CAS_URL;
      break;
    case 'NSDL':
      portalUrl = NSDL_ECAS_URL;
      break;
    case 'CDSL':
      portalUrl = CDSL_ECAS_URL;
      break;
    default:
      throw new BadRequestError('Unknown provider');
  }

  const instructions = buildInstructions(body);
  ok(res, {
    portalUrl,
    instructions,
    nextSteps: [
      'Open the portal URL and submit the form with the details shown',
      'You will receive a password-protected PDF at your registered email',
      'If an IMAP mailbox is configured, PortfolioOS will auto-import the PDF',
      'Otherwise, upload the PDF via Imports → CAS PDF and provide the PDF password',
    ],
  });
}

function buildInstructions(body: z.infer<typeof BuildRequestSchema>): string[] {
  const lines: string[] = [];
  if (body.pan) lines.push(`PAN: ${body.pan.toUpperCase()}`);
  if (body.email) lines.push(`Email: ${body.email}`);
  lines.push(`Statement type: ${body.statementType}`);
  if (body.fromDate && body.toDate) {
    lines.push(`Period: ${body.fromDate} to ${body.toDate}`);
  } else {
    lines.push('Period: All transactions');
  }
  lines.push('PDF password will be your PAN in uppercase (most providers)');
  return lines;
}
