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
  listFxRates,
  searchCryptoController,
} from '../controllers/assets.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';

export const assetsRouter = Router();

assetsRouter.use(authenticate);

assetsRouter.get('/search', asyncHandler(search));
assetsRouter.get('/crypto/search', asyncHandler(searchCryptoController));
assetsRouter.get('/quote/:symbol', asyncHandler(liveQuote));
assetsRouter.get('/stocks/:id/price', asyncHandler(latestStockPrice));
assetsRouter.get('/funds/:id/nav', asyncHandler(latestFundNav));
assetsRouter.get('/commodities/latest', asyncHandler(listCommodityPrices));
assetsRouter.get('/fx/latest', asyncHandler(listFxRates));

// Price refreshes — per asset class + bulk
assetsRouter.post('/refresh-prices', asyncHandler(refreshAllPrices));
assetsRouter.post('/portfolios/:id/refresh-prices', asyncHandler(refreshPortfolio));

// AMFI (legacy direct endpoints, kept for backward compat)
assetsRouter.post('/amfi/sync', asyncHandler(amfiSync));
assetsRouter.post('/amfi/refresh-holdings', asyncHandler(amfiRefreshHoldings));

// Unified sync endpoints
assetsRouter.post('/sync-all', asyncHandler(syncAll));
assetsRouter.post('/sync-prices', asyncHandler(syncPrices));
assetsRouter.post('/sync-universe', asyncHandler(syncUniverse));
assetsRouter.post('/sync-corp-actions', asyncHandler(syncCorpActions));
assetsRouter.post('/sync-commodities', asyncHandler(syncCommodities));
assetsRouter.post('/sync-crypto', asyncHandler(syncCrypto));
assetsRouter.post('/sync-fx', asyncHandler(syncFx));
