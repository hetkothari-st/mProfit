/**
 * Re-export the single source of truth from @portfolioos/shared so the API and
 * web agree on how each asset class is valued. Kept as a thin module so
 * existing imports (`./valuationMethod.js`) and the unit test stay stable.
 */
export { valuationMethodFor, type ValuationMethod } from '@portfolioos/shared';
