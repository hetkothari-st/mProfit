import PDFDocument from 'pdfkit';
import { formatINR, type LegacyViewDTO } from '@everypaisa/shared';
import { pdfSafe } from '../charts/pdfCharts.js';

/** One line of the shared-documents list; a will's file carries its label (a replaced will says so). */
export function legacyDocumentLine(d: LegacyViewDTO['documents'][number]): string {
  return `- ${d.fileName}${d.will ? ` (${d.will.label})` : ''}`;
}

/** Printable copy of the nominee view: same content, same scope, nothing extra. */
export function renderLegacyPdf(v: LegacyViewDTO): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).fillColor('#000').text(pdfSafe(`${v.ownerName} - financial information`));
    doc.moveDown(0.3).fontSize(10).fillColor('#555')
      .text(pdfSafe(`Shared with ${v.nomineeName} on ${v.releasedAt.slice(0, 10)}. Read-only. This is information, not a will.`));
    if (v.netWorth) {
      doc.moveDown(0.5).fillColor('#000').fontSize(12).text(pdfSafe(`Total of listed assets: ${formatINR(v.netWorth)}`));
    }
    for (const s of v.sections) {
      doc.moveDown(1).fillColor('#000').fontSize(14).text(pdfSafe(s.title));
      if (s.items.length === 0) doc.fontSize(10).fillColor('#555').text('Nothing recorded.');
      for (const it of s.items) {
        const right = [it.identifierLast4 ? `ending ${it.identifierLast4}` : null, it.amount ? formatINR(it.amount) : null]
          .filter(Boolean).join('   ');
        doc.fontSize(11).fillColor('#000').text(pdfSafe(`${it.label}${right ? `   ${right}` : ''}`));
        const sub = [it.sublabel, it.nominee ? `Nominee: ${it.nominee}` : null, ...it.notes].filter(Boolean).join(' · ');
        if (sub) doc.fontSize(9).fillColor('#555').text(pdfSafe(sub));
      }
      if (s.checklist.length) {
        doc.moveDown(0.3).fontSize(9).fillColor('#333').text('How to claim:');
        for (const step of s.checklist) doc.text(pdfSafe(`- ${step}`));
      }
    }
    if (v.documents.length) {
      doc.moveDown(1).fillColor('#000').fontSize(14).text('Documents shared');
      for (const d of v.documents) doc.fontSize(10).fillColor('#333').text(pdfSafe(legacyDocumentLine(d)));
    }
    if (v.letter) {
      doc.addPage().fontSize(14).fillColor('#000').text('Personal letter');
      doc.moveDown(0.5).fontSize(11).text(pdfSafe(v.letter));
    }
    doc.end();
  });
}
