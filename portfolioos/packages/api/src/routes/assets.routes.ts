import { Router } from 'express';
import {
  amfiRefreshHoldings,
  amfiSync,
  latestFundNav,
  latestStockPrice,
  liveQuote,
  refreshAllPrices,
  refreshPortfolio,
  search,
  syncAll,
  syncPrices,
  syncUniverse,
  syncCorpActions,
  syncCommodities,
  syncCrypto,
  syncFx,
  listCommodityPrices,
  liveCommodityPrices,
  listFxRates,
  searchCryptoController,
  liveCryptoPrices,
} from '../controllers/assets.controller.js';
import { authenticate, requireRole } from '../middleware/authenticate.js';
import { requireSecondFactor } from '../lib/professionalMfa.js';
import { priceRefreshLimiter } from '../middleware/rateLimit.js';
import { asyncHandler } from '../middleware/validate.js';

export const assetsRouter = Router();

assetsRouter.use(authenticate);

assetsRouter.get('/search', asyncHandler(search));
assetsRouter.get('/crypto/search', asyncHandler(searchCryptoController));
assetsRouter.get('/crypto/live', asyncHandler(liveCryptoPrices));
assetsRouter.get('/quote/:symbol', asyncHandler(liveQuote));
assetsRouter.get('/stocks/:id/price', asyncHandler(latestStockPrice));
assetsRouter.get('/funds/:id/nav', asyncHandler(latestFundNav));
assetsRouter.get('/commodities/latest', asyncHandler(listCommodityPrices));
assetsRouter.get('/commodities/live', asyncHandler(liveCommodityPrices));
assetsRouter.get('/fx/latest', asyncHandler(listFxRates));

// Price refreshes — the caller's own holdings, from already-loaded prices.
assetsRouter.post('/refresh-prices', priceRefreshLimiter, asyncHandler(refreshAllPrices));
assetsRouter.post('/portfolios/:id/refresh-prices', priceRefreshLimiter, asyncHandler(refreshPortfolio));

// Market-wide feeds: each call fetches from third parties and rewrites
// shared price tables and every user's holdings. Admin with two-factor only;
// the scheduler runs these for everyone else.
const adminOnly = [requireRole('ADMIN'), requireSecondFactor('admin tools')];

// AMFI (legacy direct endpoints, kept for backward compat)
assetsRouter.post('/amfi/sync', ...adminOnly, asyncHandler(amfiSync));
assetsRouter.post('/amfi/refresh-holdings', ...adminOnly, asyncHandler(amfiRefreshHoldings));

// Unified sync endpoints
assetsRouter.post('/sync-all', ...adminOnly, asyncHandler(syncAll));
assetsRouter.post('/sync-prices', ...adminOnly, asyncHandler(syncPrices));
assetsRouter.post('/sync-universe', ...adminOnly, asyncHandler(syncUniverse));
assetsRouter.post('/sync-corp-actions', ...adminOnly, asyncHandler(syncCorpActions));
assetsRouter.post('/sync-commodities', ...adminOnly, asyncHandler(syncCommodities));
assetsRouter.post('/sync-crypto', ...adminOnly, asyncHandler(syncCrypto));
assetsRouter.post('/sync-fx', ...adminOnly, asyncHandler(syncFx));
