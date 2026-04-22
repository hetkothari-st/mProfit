import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import {
  listAccountsTreeHandler,
  listAccountsFlatHandler,
  createAccountHandler,
  updateAccountHandler,
  deleteAccountHandler,
  listVouchersHandler,
  getVoucherHandler,
  createVoucherHandler,
  updateVoucherHandler,
  deleteVoucherHandler,
  nextVoucherNoHandler,
  getLedgerHandler,
  getTrialBalanceHandler,
  getPnLHandler,
  getBalanceSheetHandler,
  suggestVoucherHandler,
} from '../controllers/accounting.controller.js';

export const accountingRouter = Router();
accountingRouter.use(authenticate);

// Accounts
accountingRouter.get('/accounts/tree', asyncHandler(listAccountsTreeHandler));
accountingRouter.get('/accounts/flat', asyncHandler(listAccountsFlatHandler));
accountingRouter.post('/accounts', asyncHandler(createAccountHandler));
accountingRouter.patch('/accounts/:id', asyncHandler(updateAccountHandler));
accountingRouter.delete('/accounts/:id', asyncHandler(deleteAccountHandler));

// Vouchers
accountingRouter.get('/vouchers', asyncHandler(listVouchersHandler));
accountingRouter.get('/vouchers/next-no', asyncHandler(nextVoucherNoHandler));
accountingRouter.get('/vouchers/:id', asyncHandler(getVoucherHandler));
accountingRouter.post('/vouchers', asyncHandler(createVoucherHandler));
accountingRouter.patch('/vouchers/:id', asyncHandler(updateVoucherHandler));
accountingRouter.delete('/vouchers/:id', asyncHandler(deleteVoucherHandler));

// Ledger
accountingRouter.get('/ledger/:accountId', asyncHandler(getLedgerHandler));

// Reports
accountingRouter.get('/reports/trial-balance', asyncHandler(getTrialBalanceHandler));
accountingRouter.get('/reports/pnl', asyncHandler(getPnLHandler));
accountingRouter.get('/reports/balance-sheet', asyncHandler(getBalanceSheetHandler));

// Auto-suggest voucher from transaction
accountingRouter.get('/suggest/transaction/:txnId', asyncHandler(suggestVoucherHandler));
