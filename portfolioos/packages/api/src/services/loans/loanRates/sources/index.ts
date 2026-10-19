import type { PageReader } from '../types.js';
import { rbiHomeReader } from './rbi.js';
import { sbiRatesReader } from './sbi.js';
import { hdfcHomeReader, hdfcRatesReader } from './hdfc.js';
import { iciciHomeReader, iciciPersonalReader, iciciRatesReader } from './icici.js';
import { axisHomeReader, axisMclrReader } from './axis.js';
import { kotakRatesReader } from './kotak.js';
import { bobRetailReader, pnbMclrReader, unionRatesReader } from './psuMclr.js';
import { canaraRangeReader } from './canara.js';
import { licHomeReader } from './lic.js';

/**
 * Every page the job may fetch. This list IS the URL allow-list (spec s5.2): fetchPage refuses any URL that
 * is not one of these, and no URL ever comes from a request or the database.
 */
export const PAGE_READERS: readonly PageReader[] = [
  rbiHomeReader,
  sbiRatesReader,
  hdfcHomeReader,
  hdfcRatesReader,
  iciciHomeReader,
  iciciPersonalReader,
  iciciRatesReader,
  axisHomeReader,
  axisMclrReader,
  kotakRatesReader,
  pnbMclrReader,
  bobRetailReader,
  unionRatesReader,
  canaraRangeReader,
  licHomeReader,
];

export const READER_URLS: ReadonlySet<string> = new Set(PAGE_READERS.map((r) => r.url));

export function readerById(id: string): PageReader | undefined {
  return PAGE_READERS.find((r) => r.id === id);
}
