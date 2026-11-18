/**
 * Import per-insurer claims metrics from the IRDAI Handbook on Indian
 * Insurance Statistics (official, free).
 *
 *   npx tsx scripts/import-irdai-handbook.ts [path-or-url-to-handbook.zip] [FY ...]
 *
 * Defaults: the 2024-25 Handbook zip on irdai.gov.in, FYs 2023-24 and 2024-25.
 * Replaces every InsurerMetrics row for those FYs (so stale, differently
 * sourced rows cannot linger), one transaction per FY.
 * Find newer editions at https://irdai.gov.in/handbook-of-indian-insurance
 */
import { readFileSync } from 'node:fs';
import { Prisma } from '@prisma/client';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { prisma, runInTransaction } from '../src/lib/prisma.js';
import { runAsSystem } from '../src/lib/requestContext.js';
import { logger } from '../src/lib/logger.js';
import {
  buildMetricRecords,
  CSR_METHODOLOGY,
  parseTable53,
  parseTable56,
  parseTable62,
  type Row,
} from '../src/services/policyCheck/irdaiHandbookParse.js';
import { buildLifeRecords, LIFE_METHODOLOGY, parseTable15, parseTable37 } from '../src/services/policyCheck/irdaiLifeParse.js';

const DEFAULT_URL =
  'https://irdai.gov.in/documents/37343/825690/Handbook+on+Indian+Insurance+Statistics+2024-25.zip/c754826c-a24f-6adf-65d9-bba0e1bb8d2a?version=1.1&t=1770357151427&download=true';
const EDITION = 'Handbook on Indian Insurance Statistics 2024-25';

async function loadZip(src: string): Promise<JSZip> {
  if (/^https:\/\/irdai\.gov\.in\//.test(src)) {
    const res = await fetch(src, { headers: { 'user-agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
    return JSZip.loadAsync(Buffer.from(await res.arrayBuffer()));
  }
  return JSZip.loadAsync(readFileSync(src));
}

async function sheetRows(zip: JSZip, fileSuffix: string, sheet: string): Promise<Row[]> {
  const entry = Object.values(zip.files).find((f) => !f.dir && f.name.endsWith(fileSuffix));
  if (!entry) throw new Error(`${fileSuffix} not found in zip`);
  const wb = XLSX.read(await entry.async('nodebuffer'), { type: 'buffer' });
  // Sheet names in the Handbook carry stray spaces (' 56', '54 ').
  const ws = wb.Sheets[wb.SheetNames.find((n) => n.trim() === sheet) ?? sheet];
  if (!ws) throw new Error(`Sheet ${sheet} not found in ${fileSuffix}`);
  return XLSX.utils.sheet_to_json<Row>(ws, { header: 1, defval: null, raw: true });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const src = args[0] ?? DEFAULT_URL;
  const years = args.slice(1).length > 0 ? args.slice(1) : ['2023-24', '2024-25'];

  const zip = await loadZip(src);
  const t53 = await sheetRows(zip, 'Part II.xlsx', '53');
  const t62 = await sheetRows(zip, 'Part III.xlsx', '62');
  const t56 = await sheetRows(zip, 'Part II.xlsx', '56');
  const t15 = await sheetRows(zip, 'Part I.xlsx', '15');
  const t37 = await sheetRows(zip, 'Part I.xlsx', '37');

  const source = `IRDAI ${EDITION}, Table 53 (claims by number) and Table 62 (health net earned premium and incurred claims)`;
  const retrievedAt = new Date();

  await runAsSystem(async () => {
    for (const fy of years) {
      const records = buildMetricRecords(parseTable53(t53, fy), parseTable62(t62, fy), fy, parseTable56(t56, fy));
      if (records.length < 20) throw new Error(`Only ${records.length} insurers parsed for ${fy} — layout changed?`);
      await runInTransaction(async (tx) => {
        const del = await tx.insurerMetrics.deleteMany({ where: { financialYear: fy, segment: 'HEALTH' } });
        await tx.insurerMetrics.createMany({
          data: records.map(({ complaints, ...r }) => ({
            ...r,
            complaints: (complaints ?? undefined) as Prisma.InputJsonValue | undefined,
            source: `${source}; Table 56 (grievances)`,
            retrievedAt,
            methodology: CSR_METHODOLOGY,
          })),
        });
        logger.info({ fy, replaced: del.count, inserted: records.length }, '[irdaiHandbook] imported');
      });

      const life = buildLifeRecords(parseTable15(t15, fy), fy, parseTable37(t37, fy));
      if (life.length < 15) throw new Error(`Only ${life.length} life insurers parsed for ${fy} — layout changed?`);
      await runInTransaction(async (tx) => {
        const del = await tx.insurerMetrics.deleteMany({ where: { financialYear: fy, segment: 'LIFE' } });
        await tx.insurerMetrics.createMany({
          data: life.map(({ complaints, segment: _s, ...r }) => ({
            ...r,
            complaints: (complaints ?? undefined) as Prisma.InputJsonValue | undefined,
            segment: 'LIFE',
            source: `IRDAI ${EDITION}, Table 15 (individual death claims, insurer-wise); Table 37 (grievances)`,
            retrievedAt,
            methodology: LIFE_METHODOLOGY,
          })),
        });
        logger.info({ fy, replaced: del.count, inserted: life.length }, '[irdaiHandbook] life imported');
      });
    }
  });
}

main()
  .catch((err) => {
    logger.error({ err }, '[irdaiHandbook] import failed');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
