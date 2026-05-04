import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import {
  listCardsHandler,
  getCardHandler,
  createCardHandler,
  updateCardHandler,
  deleteCardHandler,
  getCardSummaryHandler,
  addStatementHandler,
  markStatementPaidHandler,
  deleteStatementHandler,
} from '../controllers/creditCards.controller.js';

export const creditCardsRouter = Router();
creditCardsRouter.use(authenticate);

// Card CRUD
creditCardsRouter.get('/', asyncHandler(listCardsHandler));
creditCardsRouter.post('/', asyncHandler(createCardHandler));
creditCardsRouter.get('/:id', asyncHandler(getCardHandler));
creditCardsRouter.patch('/:id', asyncHandler(updateCardHandler));
creditCardsRouter.delete('/:id', asyncHandler(deleteCardHandler));

// Computed summary
creditCardsRouter.get('/:id/summary', asyncHandler(getCardSummaryHandler));

// Statements (scoped under card)
creditCardsRouter.post('/:id/statements', asyncHandler(addStatementHandler));
creditCardsRouter.patch('/statements/:statementId', asyncHandler(markStatementPaidHandler));
creditCardsRouter.delete('/statements/:statementId', asyncHandler(deleteStatementHandler));
