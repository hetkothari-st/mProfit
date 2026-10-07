// packages/api/src/services/split/fx.ts
import { Decimal } from 'decimal.js';
import { BadRequestError } from '../../lib/errors.js';
import { getLatestFxRate } from '../../priceFeeds/fx.service.js';

/** Rate converting `from` into `to`. A user-supplied override wins. */
export async function resolveFxRate(from: string, to: string, override?: string | null): Promise<Decimal> {
  if (override != null && override !== '') {
    if (!/^\d+(\.\d+)?$/.test(override) || new Decimal(override).lte(0)) {
      throw new BadRequestError('SPLIT_BAD_INPUT: fxRate must be a positive number');
    }
    return new Decimal(override);
  }
  if (from === to) return new Decimal(1);
  const rate = await getLatestFxRate(from, to);
  if (!rate) throw new BadRequestError(`SPLIT_FX_UNAVAILABLE: no ${from}/${to} rate — enter one manually`);
  return rate.toDecimalPlaces(8, Decimal.ROUND_HALF_EVEN);
}
