// One-time fixture generator. Gated on env so it doesn't run in normal test CI.
// Usage:  MANUAL_GEN=1 pnpm --filter @portfolioos/api exec tsx test/fixtures/pf/epfo/_generate-fixture.ts
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

const out = resolve(__dirname, 'passbook-uan-100123456789.pdf');
const doc = new PDFDocument({ size: 'A4', margin: 36 });
doc.pipe(createWriteStream(out));

doc.font('Courier').fontSize(12).text('EMPLOYEES PROVIDENT FUND ORGANISATION', { align: 'center' });
doc.fontSize(10).text('UAN: 100123456789  Name: TEST USER');
doc.text('Member ID: DLCPM00123450000012345  Establishment: TEST EMPLOYER PRIVATE LIMITED');
doc.moveDown();
doc.text('Wage Month  Date         Description                        Amount       Balance');
doc.text('Apr-2024    01-04-2024   CR EMPLOYER SHARE                  5000.00      105000.00');
doc.text('Apr-2024    01-04-2024   CR EMPLOYEE SHARE                  5000.00      110000.00');
doc.text('Mar-2024    31-03-2024   CR INTEREST FY 2023-24             7800.00      117800.00');
doc.text('Feb-2024    01-02-2024   CR EMPLOYER SHARE                  4800.00      102200.00');
doc.text('Feb-2024    01-02-2024   CR EMPLOYEE SHARE                  4800.00      107000.00');
doc.end();
console.log('Generated', out);
