// One-time fixture generator. Gated on env so it doesn't run in normal test CI.
// Usage:  MANUAL_GEN=1 pnpm --filter @portfolioos/api exec tsx test/fixtures/pf/indiapost/_generate-fixture.ts
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

const out = resolve(__dirname, 'passbook-acct-12345678901.pdf');
const doc = new PDFDocument({ size: 'A4', margin: 36 });
doc.pipe(createWriteStream(out));

doc.font('Courier').fontSize(12).text('India Post Public Provident Fund (PPF) Statement', { align: 'center' });
doc.fontSize(10).text('Account No: 12345678901');
doc.text('Customer Name: TEST USER');
doc.text('Post Office: HEAD POST OFFICE, ANDHERI (DO-99887)');
doc.text('Period: 01-04-2023 to 31-03-2024');
doc.moveDown();
doc.text('Date         Particulars                    Withdrawal   Deposit      Balance');
doc.text('01-04-2023   Opening Balance                             200000.00    200000.00');
doc.text('10-06-2023   Self Deposit                                12000.00     212000.00');
doc.text('15-11-2023   PPF Deposit                                 18000.00     230000.00');
doc.text('31-03-2024   Interest Credited                           16330.00     246330.00');
doc.end();
console.log('Generated', out);
