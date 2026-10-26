/**
 * RBI 91-day T-bill auction history — side-effecting half. See
 * `rbiTbillHandbook.parse.ts` for why the series exists and what it is.
 *
 * The Handbook publishes one HTML page per annual edition, each holding about
 * a year of weekly auctions (July to July). The six editions below cover
 * 04-Jul-2012 to 25-Jul-2018, overlapping FBIL's series (which starts
 * 2017-08-23) by a year. Every id was fetched and parsed on 2026-10-26; the
 * table is identical in shape across all six. The history is closed — those
 * auctions will not be restated — so this is a one-time fill, not a feed.
 */
import { __sharedTransport, type HttpTextOutcome, type IndexFetchRange } from './nseIndices.v1.js';
import type { RiskFreeFetchOutcome } from './fbilTbillCurve.v1.js';
import type { RiskFreeParseFailure, RiskFreeRow } from './riskFree.parse.js';
import { parseRbiTbillHandbook, RBI_TBILL_SERIES } from './rbiTbillHandbook.parse.js';

export const RBI_TBILL_ADAPTER_ID = 'rbi.handbook.tbill91';
export const RBI_TBILL_ADAPTER_VERSION = '1';

/** Handbook edition page ids and the auction dates each holds. */
export const RBI_TBILL_HANDBOOK_EDITIONS: ReadonlyArray<{ id: number; from: string; to: string }> = [
  { id: 15340, from: '2012-07-04', to: '2013-08-07' }, // 2013 edition, Table 215
  { id: 16009, from: '2013-07-03', to: '2014-08-20' }, // 2014 edition, Table 215
  { id: 16662, from: '2014-07-02', to: '2015-07-22' }, // 2015 edition, Table 221
  { id: 17354, from: '2015-07-02', to: '2016-07-27' }, // 2016 edition, Table 221
  { id: 17996, from: '2016-07-05', to: '2017-07-26' }, // 2017 edition, Table 221
  { id: 18680, from: '2017-07-05', to: '2018-07-25' }, // 2018 edition, Table 215
];

export const RBI_HANDBOOK_URL = 'https://www.rbi.org.in/scripts/PublicationsView.aspx';

/** First auction this source holds. */
export const RBI_TBILL_HISTORY_START = '2012-07-04';

export interface RbiTbillFetchOptions {
  /** Injectable transport — tests set this so nothing here can reach RBI. */
  fetchText?: (url: string) => Promise<HttpTextOutcome>;
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Every auction in `range`, from the editions that overlap it.
 *
 * One failed edition fails the whole fetch: a missing year would leave a hole
 * in the middle of the series that forward-filling then papers over with a
 * year-old rate. An auction printed in two adjacent editions must agree; a
 * disagreement is a `duplicate_date` failure and the first edition's value is
 * kept.
 */
export async function fetchRbiTbillHistory(
  range: IndexFetchRange,
  options: RbiTbillFetchOptions = {},
): Promise<RiskFreeFetchOutcome> {
  const sourceRef = `${RBI_TBILL_SERIES}@${iso(range.from)}..${iso(range.to)}`;
  const get = options.fetchText ?? ((url: string) => __sharedTransport.httpGetText(url));
  const editions = RBI_TBILL_HANDBOOK_EDITIONS.filter(
    (e) => e.to >= iso(range.from) && e.from <= iso(range.to),
  );
  if (editions.length === 0) {
    return {
      ok: false,
      reason: 'EMPTY_BODY',
      detail: `No RBI Handbook edition covers ${sourceRef}; the source holds ${RBI_TBILL_HISTORY_START}..2018-07-25.`,
      sourceRef,
    };
  }

  const byDay = new Map<number, RiskFreeRow>();
  const failures: RiskFreeParseFailure[] = [];
  for (const edition of editions) {
    const url = `${RBI_HANDBOOK_URL}?id=${edition.id}`;
    const res = await get(url);
    if (!res.ok) {
      return {
        ok: false,
        reason: res.reason,
        detail: `RBI Handbook edition ${edition.id}: ${res.detail}`,
        sourceRef: url,
        ...(res.httpStatus === undefined ? {} : { httpStatus: res.httpStatus }),
      };
    }
    const parsed = parseRbiTbillHandbook(res.text);
    if (parsed.rows.length === 0) {
      return {
        ok: false,
        reason: 'PARSE_REJECTED',
        detail: `RBI Handbook edition ${edition.id} yielded no auction rows; the page layout has changed.`,
        sourceRef: url,
        bodySample: res.text.slice(0, 300),
      };
    }
    failures.push(...parsed.failures);
    for (const row of parsed.rows) {
      const t = row.date.getTime();
      if (t < range.from.getTime() || t > range.to.getTime()) continue;
      const prior = byDay.get(t);
      if (prior === undefined) byDay.set(t, row);
      else if (!prior.ratePct.equals(row.ratePct)) {
        failures.push({
          line: 0,
          raw: `${iso(row.date)}: edition ${edition.id} says ${row.ratePct.toString()}, earlier edition ${prior.ratePct.toString()}`,
          reason: 'duplicate_date',
        });
      }
    }
  }

  return {
    ok: true,
    series: RBI_TBILL_SERIES,
    rows: [...byDay.values()].sort((a, b) => a.date.getTime() - b.date.getTime()),
    failures,
    sourceRef,
    adapterId: RBI_TBILL_ADAPTER_ID,
    adapterVersion: RBI_TBILL_ADAPTER_VERSION,
  };
}
