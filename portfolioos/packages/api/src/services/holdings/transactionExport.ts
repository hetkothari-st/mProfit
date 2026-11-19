import { ASSET_CLASS_LABELS } from '@everypaisa/shared';

/** The fields of a transaction DTO the export writes. */
export interface ExportableTransaction {
  tradeDate: string;
  transactionType: string;
  assetClass: string;
  assetName: string | null;
  symbol: string | null;
  schemeCode: string | null;
  isin: string | null;
  portfolioId: string;
  quantity: string;
  price: string;
  grossAmount: string;
  brokerage: string;
  stt: string;
  stampDuty: string;
  exchangeCharges: string;
  gst: string;
  sebiCharges: string;
  otherCharges: string;
  netAmount: string;
  broker: string | null;
}

/**
 * Text cells only. A name beginning with = + - @ (or a tab/CR) is evaluated as a formula by Excel and
 * LibreOffice, and instrument names and brokers come from parsed documents, i.e. from outside; the
 * leading apostrophe makes the spreadsheet treat the rest as literal text. Numbers are written raw so a
 * negative amount stays a number.
 */
export function csvText(v: string | null | undefined): string {
  if (v == null) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const HEADER = [
  'Date', 'Type', 'Asset', 'Symbol / scheme code', 'ISIN', 'Asset class', 'Portfolio',
  'Quantity', 'Price', 'Gross amount', 'Brokerage', 'STT', 'Stamp duty', 'Exchange charges',
  'GST', 'SEBI charges', 'Other charges', 'Net amount', 'Broker',
];

/** One CSV for the rows as filtered on screen. Money and quantity stay full-precision strings. */
export function transactionsToCsv(
  rows: ExportableTransaction[],
  portfolioNames: ReadonlyMap<string, string>,
): string {
  const lines = [HEADER.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.tradeDate,
        csvText(r.transactionType),
        csvText(r.assetName),
        csvText(r.symbol ?? r.schemeCode),
        csvText(r.isin),
        csvText(ASSET_CLASS_LABELS[r.assetClass as keyof typeof ASSET_CLASS_LABELS] ?? r.assetClass),
        csvText(portfolioNames.get(r.portfolioId) ?? ''),
        r.quantity, r.price, r.grossAmount, r.brokerage, r.stt, r.stampDuty, r.exchangeCharges,
        r.gst, r.sebiCharges, r.otherCharges, r.netAmount,
        csvText(r.broker),
      ].join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}
