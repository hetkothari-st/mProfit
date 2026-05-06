// One-time fixture generator. Gated on env so it doesn't run in normal test CI.
// Usage:  MANUAL_GEN=1 pnpm --filter @portfolioos/api exec tsx test/fixtures/pf/pnb/_generate-fixture.ts
import PDFDocument from 'pdfkit';
import { createWriteStream } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.MANUAL_GEN !== '1') {
  console.log('Skipping fixture generation (set MANUAL_GEN=1 to run)');
  process.exit(0);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const out = resolve(__dirname, 'passbook-acct-1234567890123456.pdf');
const doc = new PDFDocument({ size: 'A4', margin: 36 });
doc.pipe(createWriteStream(out));

doc.font('Courier').fontSize(12).text('Punjab National Bank Public Provident Fund (PPF) Statement', { align: 'center' });
doc.fontSize(10).text('Account No: 1234567890123456');
doc.text('Customer Name: TEST USER');
doc.text('Branch: ANDHERI BRANCH (PNB-12345)');
doc.text('Period: 01-04-2023 to 31-03-2024');
doc.moveDown();
doc.text('Date         Particulars                    Withdrawal   Deposit      Balance');
doc.text('01-04-2023   Opening Balance                             80000.00     80000.00');
doc.text('15-07-2023   PPF Deposit                                 10000.00     90000.00');
doc.text('20-01-2024   Self Deposit                                10000.00     100000.00');
doc.text('31-03-2024   Interest Credited                           6710.00      106710.00');
doc.end();
console.log('Generated', out);
