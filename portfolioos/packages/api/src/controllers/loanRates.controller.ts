import type { Request, Response } from 'express';
import { z } from 'zod';
import { RATE_LOAN_TYPES } from '@everypaisa/shared';
import { ok } from '../lib/response.js';
import { listLoanRates } from '../services/loanRates/loanRates.service.js';

const listQuery = z.object({ loanType: z.enum(RATE_LOAN_TYPES).default('HOME') });

/** GET /api/loan-rates?loanType=HOME */
export async function listLoanRatesHandler(req: Request, res: Response): Promise<void> {
  const { loanType } = listQuery.parse(req.query);
  ok(res, await listLoanRates(loanType));
}
