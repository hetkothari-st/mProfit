import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireFeature } from '../middleware/requirePlan.js';
import { asyncHandler } from '../middleware/validate.js';
import { uploadImportFile } from '../middleware/upload.js';
import { rebindUserContext } from '../middleware/rebindUserContext.js';
import {
  listClientsHandler,
  createManagedClientHandler,
  inviteClientHandler,
  acceptInvitationHandler,
  revokeGrantHandler,
  listMyProfessionalsHandler,
  listCaActivityHandler,
} from '../controllers/ca.controller.js';
import {
  caListAccountsTree,
  caListAccountsFlat,
  caCreateAccount,
  caUpdateAccount,
  caDeleteAccount,
  caListVouchers,
  caGetVoucher,
  caNextVoucherNo,
  caCreateVoucher,
  caUpdateVoucher,
  caDeleteVoucher,
  caGenerateFromActivity,
  caGetLedger,
  caGetTrialBalance,
  caGetPnL,
  caGetBalanceSheet,
  caCreateTransaction,
  caCorrectTransaction,
  caListTransactions,
  caCreateImport,
  caListImports,
  caListFmv,
  caSetFmv,
  caDeleteFmv,
} from '../controllers/caAccounting.controller.js';

/**
 * The CA's own surface: their client list, and those clients' books.
 *
 * Gated by CA_WORKSPACE (PRO_ADVISOR). Everything under `/clients/:clientId`
 * additionally resolves the grant per request — the tier gate says "you may
 * use this feature", the grant says "you may act for this person", and the RLS
 * policies say what you may touch once you do. Three independent gates, none
 * of them standing in for another.
 */
export const caRouter = Router();
caRouter.use(authenticate);
caRouter.use(requireFeature('CA_WORKSPACE'));

// Grants
caRouter.get('/clients', asyncHandler(listClientsHandler));
caRouter.post('/clients', asyncHandler(createManagedClientHandler));
// Returns the invitation token to the caller rather than emailing it. Delivery
// is deliberately left to the caller for now: wiring it to the mailer without
// a template, a bounce path and a rate limit would be worse than an explicit
// gap, and the token is useless without the invitee's own login anyway.
caRouter.post('/clients/invite', asyncHandler(inviteClientHandler));
caRouter.post('/clients/:clientId/revoke', asyncHandler(revokeGrantHandler));
caRouter.get('/activity', asyncHandler(listCaActivityHandler));

// A client's books. Every one of these resolves the grant first.
caRouter.get('/clients/:clientId/accounts/tree', asyncHandler(caListAccountsTree));
caRouter.get('/clients/:clientId/accounts/flat', asyncHandler(caListAccountsFlat));
caRouter.post('/clients/:clientId/accounts', asyncHandler(caCreateAccount));
caRouter.patch('/clients/:clientId/accounts/:id', asyncHandler(caUpdateAccount));
caRouter.delete('/clients/:clientId/accounts/:id', asyncHandler(caDeleteAccount));

caRouter.get('/clients/:clientId/vouchers', asyncHandler(caListVouchers));
caRouter.get('/clients/:clientId/vouchers/next-no', asyncHandler(caNextVoucherNo));
caRouter.get('/clients/:clientId/vouchers/:id', asyncHandler(caGetVoucher));
caRouter.post('/clients/:clientId/vouchers', asyncHandler(caCreateVoucher));
caRouter.patch('/clients/:clientId/vouchers/:id', asyncHandler(caUpdateVoucher));
caRouter.delete('/clients/:clientId/vouchers/:id', asyncHandler(caDeleteVoucher));

// Re-derive vouchers from the client's recorded activity. The books tabs do
// this on open; this is for catching up without a reload after the client has
// added something.
caRouter.post('/clients/:clientId/vouchers/generate', asyncHandler(caGenerateFromActivity));

// A CA may add a transaction and correct one, but never delete one — there
// is deliberately no DELETE route here and no RLS policy that would satisfy
// it. INSERT used to be forbidden too ("a CA cannot conjure a trade into
// existence"), but `correctTransactionSchema` already lets a CA rewrite
// every economic field on an existing row, so that boundary protected an
// empty ledger, not a real one. See ca-access.test.ts
// ("lets a CA create and correct a client transaction, and records both")
// and the `transaction_ca_insert` migration comment for the full reasoning.
caRouter.get('/clients/:clientId/transactions', asyncHandler(caListTransactions));
caRouter.post('/clients/:clientId/transactions', asyncHandler(caCreateTransaction));
caRouter.patch('/clients/:clientId/transactions/:id', asyncHandler(caCorrectTransaction));

// Statement / contract-note / CAS uploads, scoped to the client. Reuses the
// SAME upload middleware, request body schema, `createImportJob` call and
// parser pipeline the client's own `POST /api/imports` route does — see
// `caCreateImport`. `rebindUserContext` after multer for the same reason
// `imports.routes.ts` needs it: multer's streaming parser can drop the ALS
// store `authenticate` set, which would make `getCaScope` see no caller.
caRouter.get('/clients/:clientId/imports', asyncHandler(caListImports));
caRouter.post(
  '/clients/:clientId/imports',
  uploadImportFile,
  rebindUserContext,
  asyncHandler(caCreateImport),
);

// Section 55(2)(ac) fair market values. PUT is an upsert keyed by ISIN — the
// override either exists for that scrip or it does not, so there is no
// separate create and update to keep in step.
caRouter.get('/clients/:clientId/fmv', asyncHandler(caListFmv));
caRouter.put('/clients/:clientId/fmv/:isin', asyncHandler(caSetFmv));
caRouter.delete('/clients/:clientId/fmv/:isin', asyncHandler(caDeleteFmv));

caRouter.get('/clients/:clientId/ledger', asyncHandler(caGetLedger));
caRouter.get('/clients/:clientId/trial-balance', asyncHandler(caGetTrialBalance));
caRouter.get('/clients/:clientId/pnl', asyncHandler(caGetPnL));
caRouter.get('/clients/:clientId/balance-sheet', asyncHandler(caGetBalanceSheet));

/**
 * The CLIENT's side of the same relationship.
 *
 * Deliberately not behind CA_WORKSPACE: the person whose books these are must
 * always be able to see who has access and take it away, whatever plan they
 * are on and whether or not their CA is cooperative. A revoke button that
 * needed a subscription would not be a revoke button.
 */
export const professionalAccessRouter = Router();
professionalAccessRouter.use(authenticate);
professionalAccessRouter.get('/', asyncHandler(listMyProfessionalsHandler));
professionalAccessRouter.get('/activity', asyncHandler(listCaActivityHandler));
professionalAccessRouter.post('/:clientId/revoke', asyncHandler(revokeGrantHandler));
professionalAccessRouter.post('/invitations/:token/accept', asyncHandler(acceptInvitationHandler));
