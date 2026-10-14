import PDFDocument from 'pdfkit';
import { createCanvas } from '@napi-rs/canvas';

/** Builders for the file fixtures the Documents sorter tests read. All generated, nothing binary is committed. */

function collect(doc: InstanceType<typeof PDFDocument>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

/** A PDF with a real text layer. */
export function makeTextPdf(text: string): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.fontSize(12).text(text);
  return collect(doc);
}

/** A PNG of large black text on white, easy for OCR. */
export function makeTextPng(text: string): Promise<Buffer> {
  const canvas = createCanvas(1400, 260);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 96px sans-serif';
  ctx.fillText(text, 40, 160);
  return Promise.resolve(canvas.toBuffer('image/png'));
}

/** A PDF whose only content is a picture of text: no text layer, OCR required. */
export async function makeImageOnlyPdf(text: string): Promise<Buffer> {
  const png = await makeTextPng(text);
  const doc = new PDFDocument({ size: 'A4', margin: 30 });
  doc.image(png, 30, 60, { width: 530 });
  return collect(doc);
}

/** A password-protected PDF with a text layer. */
export function makeEncryptedPdf(password: string): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 50, userPassword: password, ownerPassword: `${password}-owner` });
  doc.fontSize(12).text('Bank Statement\nAccount Holder: TEST USER\nWithdrawal Deposit Balance');
  return collect(doc);
}
