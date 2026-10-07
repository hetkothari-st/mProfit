// packages/api/src/services/split/fx.ts
import { Decimal } from 'decimal.js';
import { BadRequestError } from '../../lib/errors.js';
import { getLatestFxRate } from '../../priceFeeds/fx.service.js';

/** Rate converting `from` into `to`. A user-supplied override wins. */
export async function resolveFxRate(from: string, to: string, override?: string | null): Promise<Decimal> {
  const hasOverride = override != null && override !== '';
  if (from === to) {
    if (hasOverride && !(/^\d+(\.\d+)?$/.test(override) && new Decimal(override).eq(1))) {
      throw new BadRequestError('SPLIT_BAD_INPUT: fxRate must be 1 when currencies match');
    }
    return new Decimal(1);
  }
  if (hasOverride) {
    if (!/^\d+(\.\d+)?$/.test(override)) throw new BadRequestError('SPLIT_BAD_INPUT: fxRate must be a positive number');
    const r = new Decimal(override).toDecimalPlaces(8, Decimal.ROUND_HALF_EVEN);
    if (r.lte(0) || r.gte('1e10')) throw new BadRequestError('SPLIT_BAD_INPUT: fxRate out of range');
    return r;
  }
  const rate = await getLatestFxRate(from, to);
  if (!rate) throw new BadRequestError(`SPLIT_FX_UNAVAILABLE: no ${from}/${to} rate — enter one manually`);
  return rate.toDecimalPlaces(8, Decimal.ROUND_HALF_EVEN);
}
