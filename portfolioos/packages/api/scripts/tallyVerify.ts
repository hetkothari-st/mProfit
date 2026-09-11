/**
 * Prove a Tally export imports cleanly — into a real TallyPrime.
 *
 * Sends each XML file in the export ZIP, in order, to TallyPrime's XML server
 * and reports Tally's own verdict (created / altered / errors / line errors /
 * exceptions). Exits non-zero if Tally rejected anything.
 *
 * Setup (help.tallysolutions.com — Pre-requisites for integrations):
 *   1. TallyPrime: Exchange > Data Synchronization — "TallyPrime act as: Both",
 *      Port 9000.
 *   2. Create and open a company whose "Books beginning from" is the date the
 *      export's README names. A company must be open for imports to land.
 *
 * Run (local only — nothing leaves this machine except the requests to Tally):
 *   pnpm --filter @everypaisa/api exec tsx scripts/tallyVerify.ts <export.zip> [--url http://localhost:9000]
 *   pnpm --filter @everypaisa/api exec tsx scripts/tallyVerify.ts --sample <out.zip> [--send]
 *
 * --sample writes a small export covering every kind of entry, dated only on
 * the 1st or 2nd of a month, so it also imports into TallyPrime's Educational
 * mode, which may restrict voucher dates. Add --send to import it straight away.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { buildTallyBook, emptyTallySources, type TallySources } from '../src/services/tally/tallyBook.js';
import { tallyZipEntries } from '../src/services/tally/tallyPackage.js';
import { parseTallyImportResponse } from '../src/services/tally/tallyResponse.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Every kind of entry the export produces, on Educational-mode-safe dates. */
function sampleSources(): TallySources {
  return {
    ...emptyTallySources(),
    bankAccounts: [{ id: 'b1', label: 'Sample Bank Savings', last4: '1234', isOverdraft: false, currentBalance: '150000' }],
    cashFlows: [
      { id: 'c1', date: '2025-05-01', direction: 'IN', amount: '80000', description: 'Salary', bankAccountId: 'b1' },
      { id: 'c2', date: '2025-05-02', direction: 'OUT', amount: '12000', description: 'Rent paid', bankAccountId: 'b1' },
      { id: 'c3', date: '2025-06-01', direction: 'IN', amount: '2500', description: 'UPI credit', bankAccountId: null },
    ],
    trades: [
      {
        id: 't1', date: '2024-04-01', kind: 'BUY', assetClass: 'EQUITY', holdingKey: 's:inf', holdingName: 'Sample Infosys Ltd',
        quantity: '10', price: '1450', gross: '14500', charges: '20.35', cost: null, shortTermGain: '0', longTermGain: '0',
      },
      {
        id: 't2', date: '2025-01-02', kind: 'SELL', assetClass: 'EQUITY', holdingKey: 's:inf', holdingName: 'Sample Infosys Ltd',
        quantity: '4', price: '1600', gross: '6400', charges: '10', cost: '5808.14', shortTermGain: '581.86', longTermGain: '0',
      },
      {
        id: 't3', date: '2024-06-01', kind: 'SIP', assetClass: 'MUTUAL_FUND', holdingKey: 'f:axis', holdingName: 'Sample Axis Bluechip Fund',
        quantity: '120.456', price: '41.51', gross: '5000', charges: '0', cost: null, shortTermGain: '0', longTermGain: '0',
      },
      {
        id: 't4', date: '2024-07-01', kind: 'DIVIDEND_PAYOUT', assetClass: 'EQUITY', holdingKey: 's:inf', holdingName: 'Sample Infosys Ltd',
        quantity: '0', price: '0', gross: '215', charges: '0', cost: null, shortTermGain: '0', longTermGain: '0',
      },
      {
        id: 't5', date: '2024-08-01', kind: 'DEPOSIT', assetClass: 'FIXED_DEPOSIT', holdingKey: 'fd:1', holdingName: 'Sample Bank FD 7.1%',
        quantity: '1', price: '100000', gross: '100000', charges: '0', cost: null, shortTermGain: '0', longTermGain: '0',
      },
    ],
    loans: [{ id: 'l1', label: 'Sample Home Loan 9876', principal: '2500000', disbursedOn: '2024-04-02' }],
    loanPayments: [{ id: 'p1', loanId: 'l1', date: '2024-05-02', amount: '24000', principal: '6500', interest: '17500', kind: 'EMI' }],
    cards: [{ id: 'k1', label: 'Sample Bank Card 4321' }],
    cardStatements: [{ id: 's1', cardId: 'k1', date: '2024-09-01', statementAmount: '18250.50', paid: '18250.50', paidOn: '2024-09-02' }],
    rent: [
      { id: 'r1', date: '2024-10-01', property: 'Sample Flat', tenant: 'Sample Tenant', kind: 'DEPOSIT', amount: '60000' },
      { id: 'r2', date: '2024-10-02', property: 'Sample Flat', tenant: 'Sample Tenant', kind: 'PAYMENT', amount: '30000' },
    ],
    propertyExpenses: [{ id: 'e1', date: '2024-11-01', property: 'Sample Flat', description: 'Society maintenance', amount: '3500' }],
    premiums: [{ id: 'q1', date: '2024-12-01', policy: 'Sample Term Plan', amount: '14999' }],
  };
}

async function send(url: string, name: string, xml: string): Promise<boolean> {
  let text: string;
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: xml });
    text = await res.text();
  } catch (err) {
    console.error(`✗ ${name}: could not reach TallyPrime at ${url} — is it open, with a company loaded and port 9000 on?`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
  const r = parseTallyImportResponse(text);
  const counts = `created ${r.created}, altered ${r.altered}, combined ${r.combined}, ignored ${r.ignored}, errors ${r.errors}, exceptions ${r.exceptions}`;
  console.log(`${r.ok ? '✓' : '✗'} ${name}: ${counts}`);
  for (const e of r.lineErrors) console.log(`    ${e}`);
  if (!r.ok && r.lineErrors.length === 0) console.log(`    Tally replied: ${text.slice(0, 500)}`);
  return r.ok;
}

async function main() {
  const url = arg('--url') ?? 'http://localhost:9000';
  const { default: JSZip } = await import('jszip');

  let files: Array<{ name: string; content: string }>;
  const samplePath = arg('--sample');
  if (samplePath) {
    const entries = tallyZipEntries(buildTallyBook(sampleSources()));
    const zip = new JSZip();
    for (const e of entries) zip.file(e.name, e.content);
    await writeFile(samplePath, await zip.generateAsync({ type: 'nodebuffer' }));
    console.log(`Wrote sample export: ${samplePath}`);
    console.log(entries.find((e) => e.name.startsWith('README'))!.content);
    if (!process.argv.includes('--send')) return;
    files = entries;
  } else {
    const zipPath = process.argv[2];
    if (!zipPath || zipPath.startsWith('--')) {
      console.error('Usage: tsx scripts/tallyVerify.ts <export.zip> [--url http://localhost:9000] | --sample <out.zip> [--send]');
      process.exit(2);
    }
    const zip = await JSZip.loadAsync(await readFile(zipPath));
    files = await Promise.all(
      Object.values(zip.files)
        .filter((f) => !f.dir)
        .map(async (f) => ({ name: f.name, content: await f.async('string') })),
    );
  }

  // Masters first, then each year in order — the numbers on the file names.
  const xmlFiles = files
    .filter((f) => f.name.endsWith('.xml'))
    .sort((a, b) => Number.parseInt(a.name, 10) - Number.parseInt(b.name, 10));
  let allOk = true;
  for (const f of xmlFiles) {
    const ok = await send(url, f.name, f.content);
    allOk &&= ok;
    if (!ok) break; // later files depend on earlier ones
  }
  console.log(allOk ? '\nTally accepted every file.' : '\nTally rejected part of the export — see above.');
  process.exit(allOk ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
