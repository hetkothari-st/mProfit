/**
 * Shared side-effecting scaffolding for the `<amc>.v1.ts` adapters.
 *
 * NOT pure — this is the half that touches the network. It is deliberately
 * thin: resolve a URL, fetch it, hand the bytes to a pure parser, translate a
 * thrown transport error into a typed failure. The less judgement lives here,
 * the less breaks when an AMC moves a page (`CONTEXT.md §14`, and the same
 * rationale written out in `adapters/pf/epf/uanLookup.v1.ts`).
 *
 * ⚠ EVERY URL TEMPLATE IN THE `.v1.ts` FILES THAT CALL THIS IS **UNVERIFIED**.
 * See each file's header.
 */

import { logger } from '../../lib/logger.js';
import { csvToGrid } from './normalise.js';
import { factsheetFail } from './types.js';
import type {
  FactsheetFetchContext,
  MfFactsheetResult,
  PortfolioParseInput,
  PortfolioRaw,
  SchemeFactsParseInput,
  SchemeFactsRaw,
} from './types.js';

/**
 * Fetch a CSV/text portfolio export and run it through a pure parser.
 *
 * A transport failure becomes `FETCH_FAILED` (retryable) rather than
 * `PORTAL_CHANGED` (needs a human). Conflating the two is how a week of
 * transient 503s gets logged as "the AMC redesigned" and a real redesign gets
 * logged as "flaky network" — the operator then acts on neither.
 */
export async function fetchAndParsePortfolioCsv(args: {
  adapterId: string;
  url: string;
  schemeCode: string;
  asOf: Date;
  ctx: FactsheetFetchContext;
  parse: (input: PortfolioParseInput) => MfFactsheetResult<PortfolioRaw>;
  marketCapLookup?: PortfolioParseInput['marketCapLookup'];
}): Promise<MfFactsheetResult<PortfolioRaw>> {
  let text: string;
  try {
    text = await args.ctx.fetchText(args.url, { signal: args.ctx.abortSignal });
  } catch (err) {
    logger.warn(
      { adapter: args.adapterId, schemeCode: args.schemeCode, url: args.url, err },
      'mfFactsheet.portfolio.fetchFailed',
    );
    return factsheetFail(
      'FETCH_FAILED',
      `Could not fetch ${args.url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (text.trim().length === 0) {
    // An empty body for a month the AMC has not published yet is expected, not
    // a defect — the holdings job runs on the 12th and some AMCs are late.
    return factsheetFail(
      'NOT_PUBLISHED',
      `${args.url} returned an empty body; the disclosure for this month is probably not out yet.`,
    );
  }

  const input: PortfolioParseInput = {
    schemeCode: args.schemeCode,
    rows: csvToGrid(text),
    expectedAsOf: args.asOf,
    ...(args.marketCapLookup === undefined ? {} : { marketCapLookup: args.marketCapLookup }),
  };
  return args.parse(input);
}

/** Fetch a factsheet page as text and run it through a pure parser. */
export async function fetchAndParseFacts(args: {
  adapterId: string;
  url: string;
  schemeCode: string;
  ctx: FactsheetFetchContext;
  parse: (input: SchemeFactsParseInput) => MfFactsheetResult<SchemeFactsRaw>;
  planType?: 'DIRECT' | 'REGULAR';
  expectedAsOf?: Date;
}): Promise<MfFactsheetResult<SchemeFactsRaw>> {
  let text: string;
  try {
    text = await args.ctx.fetchText(args.url, { signal: args.ctx.abortSignal });
  } catch (err) {
    logger.warn(
      { adapter: args.adapterId, schemeCode: args.schemeCode, url: args.url, err },
      'mfFactsheet.facts.fetchFailed',
    );
    return factsheetFail(
      'FETCH_FAILED',
      `Could not fetch ${args.url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return args.parse({
    schemeCode: args.schemeCode,
    text,
    ...(args.planType === undefined ? {} : { planType: args.planType }),
    ...(args.expectedAsOf === undefined ? {} : { expectedAsOf: args.expectedAsOf }),
  });
}

/** `YYYY-MM` from a Date, in UTC. Used to build month-scoped disclosure URLs. */
export function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}
