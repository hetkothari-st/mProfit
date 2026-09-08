/**
 * "Everything for FY 2025-26", as one zip.
 *
 * The reports this assembles were written at different times and take
 * different parameters — some want a financial year, some a from/to window,
 * some a single as-of date. `financialYearRange` translates once, centrally,
 * so a bundle and a hand-run report can never disagree about where a year
 * starts.
 *
 * PARTIAL FAILURE IS REPORTED, NEVER SWALLOWED. If one builder throws, the zip
 * still arrives with everything else in it and gains a `FAILED-<name>.txt`
 * naming what went wrong, and the manifest lists it. A bundle that quietly
 * contained nine files instead of ten would be worse than one that failed
 * outright: the recipient would file it believing it complete. This is the
 * same rule the advisor engine follows — a broken rule is a broken rule, not a
 * broken run.
 *
 * Rendering goes through a `PassThrough` standing in for the response, because
 * `streamPdf`/`streamExcel` write to `res` and are used by forty-odd handlers.
 * They touch only `setHeader`, `on` and the stream itself, so a sink is enough
 * — cheaper and far less risky than refactoring both renderers to hand back
 * buffers.
 */

import { PassThrough } from 'node:stream';
import type { Response } from 'express';
import { financialYearRange } from '@portfolioos/shared';
import { logger } from '../../lib/logger.js';
import {
  streamExcel,
  type ExportPayload,
} from '../export.service.js';
import { buildHoldingsStatement } from '../reportBuilder/statement/holdings.js';
import { buildCapitalGainsStatement } from '../reportBuilder/statement/capitalGains.js';
import { buildIncomeStatement } from '../reportBuilder/statement/income.js';
import { buildLedgerStatement } from '../reportBuilder/statement/ledger.js';
import { buildProvidentFundStatement } from '../reportBuilder/statement/providentFund.js';
import {
  buildTallyMastersXml,
  buildTallyVouchersXml,
} from '../reportBuilder/tally/tallyExport.service.js';

/** Collect what a `res`-writing renderer produces. */
async function renderToBuffer(
  write: (sink: Response) => Promise<void>,
): Promise<Buffer> {
  const sink = new PassThrough();
  const chunks: Buffer[] = [];
  sink.on('data', (c: Buffer) => chunks.push(c));

  // The renderers set Content-Type and Content-Disposition, which mean nothing
  // for a file going into a zip.
  (sink as unknown as { setHeader: () => void }).setHeader = () => undefined;

  await write(sink as unknown as Response);
  return Buffer.concat(chunks);
}

interface BundlePart {
  name: string;
  produce: () => Promise<Buffer | string>;
}

export interface FyBundleResult {
  zip: Buffer;
  included: string[];
  failed: Array<{ name: string; reason: string }>;
}

export async function buildFyBundle(userId: string, fy: string): Promise<FyBundleResult> {
  const { from, to } = financialYearRange(fy);
  // Point-in-time reports take the last day of the year; range reports take
  // both ends. One translation, applied consistently.
  const asOf = new Date(to);
  const fromDate = new Date(from);
  const toDate = new Date(to);

  const xlsx = (payload: ExportPayload) => renderToBuffer((sink) => streamExcel(sink, payload));

  const parts: BundlePart[] = [
    {
      name: `holdings-${fy}.xlsx`,
      produce: async () =>
        xlsx(await buildHoldingsStatement({ userId, portfolioIds: [], asOf })),
    },
    {
      name: `capital-gains-${fy}.xlsx`,
      produce: async () =>
        xlsx(await buildCapitalGainsStatement({ userId, portfolioIds: [], fy, kind: 'all' })),
    },
    {
      name: `income-${fy}.xlsx`,
      produce: async () => xlsx(await buildIncomeStatement({ userId, portfolioIds: [], fy })),
    },
    {
      name: `ledger-${fy}.xlsx`,
      produce: async () =>
        xlsx(await buildLedgerStatement({ userId, portfolioIds: [], from: fromDate, to: toDate })),
    },
    {
      name: `provident-fund-${fy}.xlsx`,
      produce: async () =>
        xlsx(await buildProvidentFundStatement({ userId, from: fromDate, to: toDate })),
    },
    {
      name: `tally-masters-${fy}.xml`,
      produce: async () => (await buildTallyMastersXml(userId)).xml,
    },
    {
      name: `tally-vouchers-${fy}.xml`,
      produce: async () => (await buildTallyVouchersXml(userId, { from, to })).xml,
    },
  ];

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const included: string[] = [];
  const failed: Array<{ name: string; reason: string }> = [];

  for (const part of parts) {
    try {
      zip.file(part.name, await part.produce());
      included.push(part.name);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      // Logged AND written into the zip. A failure the recipient cannot see is
      // the failure mode this whole design is guarding against.
      logger.error({ err, userId, fy, part: part.name }, '[fy-bundle] part failed');
      zip.file(
        `FAILED-${part.name}.txt`,
        `This report could not be generated.\n\nReport: ${part.name}\nReason: ${reason}\n\n` +
          `The rest of this bundle is unaffected. Try that report on its own for the full error.`,
      );
      failed.push({ name: part.name, reason });
    }
  }

  zip.file(
    'manifest.txt',
    [
      `PortfolioOS — financial year ${fy}`,
      `Period: ${from} to ${to}`,
      `Generated: ${new Date().toISOString()}`,
      '',
      `Included (${included.length}):`,
      ...included.map((n) => `  ${n}`),
      ...(failed.length > 0
        ? [
            '',
            `NOT included (${failed.length}) — this bundle is incomplete:`,
            ...failed.map((f) => `  ${f.name} — ${f.reason}`),
          ]
        : []),
    ].join('\n'),
  );

  return { zip: await zip.generateAsync({ type: 'nodebuffer' }), included, failed };
}
