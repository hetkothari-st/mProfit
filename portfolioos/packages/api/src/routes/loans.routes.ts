import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import {
  listLoansHandler,
  getLoanHandler,
  createLoanHandler,
  updateLoanHandler,
  deleteLoanHandler,
  getLoanSummaryHandler,
  getAmortizationHandler,
  addPaymentHandler,
  deletePaymentHandler,
  computeEmiHandler,
} from '../controllers/loans.controller.js';

export const loansRouter = Router();
loansRouter.use(authenticate);

// Utility: compute EMI without creating a loan
loansRouter.get('/compute-emi', asyncHandler(computeEmiHandler));

// Loan CRUD
loansRouter.get('/', asyncHandler(listLoansHandler));
loansRouter.post('/', asyncHandler(createLoanHandler));
loansRouter.get('/:id', asyncHandler(getLoanHandler));
loansRouter.patch('/:id', asyncHandler(updateLoanHandler));
loansRouter.delete('/:id', asyncHandler(deleteLoanHandler));

// Computed views
loansRouter.get('/:id/summary', asyncHandler(getLoanSummaryHandler));
loansRouter.get('/:id/amortization', asyncHandler(getAmortizationHandler));

// Payments (scoped under loan)
loansRouter.post('/:id/payments', asyncHandler(addPaymentHandler));
loansRouter.delete('/payments/:paymentId', asyncHandler(deletePaymentHandler));
