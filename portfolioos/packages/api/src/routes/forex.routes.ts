import { Router } from 'express';
import {
  listBalances,
  getBalance,
  createBalance,
  updateBalance,
  removeBalance,
  revealAccount,
  listLrs,
  createLrs,
  removeLrs,
  lrsUtilisation,
  listTcs,
  createTcs,
  removeTcs,
  ticker,
  refreshTicker,
  pairPnl,
  supportedCurrencies,
} from '../controllers/forex.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';

export const forexRouter = Router();

forexRouter.use(authenticate);

// Ticker + meta
forexRouter.get('/ticker', asyncHandler(ticker));
forexRouter.post('/ticker/refresh', asyncHandler(refreshTicker));
forexRouter.get('/currencies', asyncHandler(supportedCurrencies));

// Forex balances (foreign-currency cash holdings)
forexRouter.get('/balances', asyncHandler(listBalances));
forexRouter.post('/balances', asyncHandler(createBalance));
forexRouter.get('/balances/:id', asyncHandler(getBalance));
forexRouter.patch('/balances/:id', asyncHandler(updateBalance));
forexRouter.delete('/balances/:id', asyncHandler(removeBalance));
forexRouter.post('/balances/:id/reveal', asyncHandler(revealAccount));

// LRS remittances — specific paths before parameterised ones.
forexRouter.get('/lrs/utilisation', asyncHandler(lrsUtilisation));
forexRouter.get('/lrs', asyncHandler(listLrs));
forexRouter.post('/lrs', asyncHandler(createLrs));
forexRouter.delete('/lrs/:id', asyncHandler(removeLrs));

// TCS credits
forexRouter.get('/tcs', asyncHandler(listTcs));
forexRouter.post('/tcs', asyncHandler(createTcs));
forexRouter.delete('/tcs/:id', asyncHandler(removeTcs));

// Forex pair P&L
forexRouter.get('/pairs/:portfolioId/pnl', asyncHandler(pairPnl));
