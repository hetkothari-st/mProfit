import { Router } from 'express';
import {
  listPropertiesHandler,
  getPropertyHandler,
  createPropertyHandler,
  updatePropertyHandler,
  deletePropertyHandler,
  createTenancyHandler,
  updateTenancyHandler,
  deleteTenancyHandler,
  listReceiptsHandler,
  markReceiptReceivedHandler,
  skipReceiptHandler,
  undoAutoMatchHandler,
  unmarkReceivedHandler,
  unskipReceiptHandler,
  listExpensesHandler,
  addExpenseHandler,
  removeExpenseHandler,
  propertyPnLHandler,
  markOverdueHandler,
} from '../controllers/rental.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';

export const rentalRouter = Router();

rentalRouter.use(authenticate);

// Properties
rentalRouter.get('/properties', asyncHandler(listPropertiesHandler));
rentalRouter.post('/properties', asyncHandler(createPropertyHandler));
rentalRouter.get('/properties/:id', asyncHandler(getPropertyHandler));
rentalRouter.patch('/properties/:id', asyncHandler(updatePropertyHandler));
rentalRouter.delete('/properties/:id', asyncHandler(deletePropertyHandler));
rentalRouter.get('/properties/:id/pnl', asyncHandler(propertyPnLHandler));

// Tenancies (nested under a property for create; flat for mutate/delete)
rentalRouter.post('/properties/:id/tenancies', asyncHandler(createTenancyHandler));
rentalRouter.patch('/tenancies/:tenancyId', asyncHandler(updateTenancyHandler));
rentalRouter.delete('/tenancies/:tenancyId', asyncHandler(deleteTenancyHandler));

// Receipts
rentalRouter.get('/receipts', asyncHandler(listReceiptsHandler));
rentalRouter.post('/receipts/:receiptId/mark-received', asyncHandler(markReceiptReceivedHandler));
rentalRouter.post('/receipts/:receiptId/skip', asyncHandler(skipReceiptHandler));
rentalRouter.post('/receipts/:receiptId/undo-auto-match', asyncHandler(undoAutoMatchHandler));
rentalRouter.post('/receipts/:receiptId/unmark-received', asyncHandler(unmarkReceivedHandler));
rentalRouter.post('/receipts/:receiptId/unskip', asyncHandler(unskipReceiptHandler));
rentalRouter.post('/receipts/mark-overdue', asyncHandler(markOverdueHandler));

// Expenses
rentalRouter.get('/expenses', asyncHandler(listExpensesHandler));
rentalRouter.post('/properties/:id/expenses', asyncHandler(addExpenseHandler));
rentalRouter.delete('/expenses/:expenseId', asyncHandler(removeExpenseHandler));

// Reminders — approval queue for tenant email/SMS rent reminders.
import {
  getReminders,
  patchReminder,
  rejectReminderHandler,
  approveReminderHandler,
  runReminderScanHandler,
} from '../controllers/rentalReminders.controller.js';

rentalRouter.get('/reminders', asyncHandler(getReminders));
rentalRouter.patch('/reminders/:id', asyncHandler(patchReminder));
rentalRouter.post('/reminders/:id/reject', asyncHandler(rejectReminderHandler));
rentalRouter.post('/reminders/:id/approve', asyncHandler(approveReminderHandler));
rentalRouter.post('/reminders/scan', asyncHandler(runReminderScanHandler));
