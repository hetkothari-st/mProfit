import { describe, it, expect } from 'vitest';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { selectWillTemplate, WILL_PDF_FOOTER, type WillPayload } from '@everypaisa/shared';
import { renderWillPdf } from '../../src/services/will/willPdf.js';
import { scriptRuns } from '../../src/services/will/willFonts.js';
import { TODAY, validWillPayload } from './willFixtures.js';

const render = (m: WillPayload) =>
  renderWillPdf({ blocks: selectWillTemplate(m).render(m, { generatedOn: TODAY }), generatedOn: TODAY, footer: WILL_PDF_FOOTER });

describe('scriptRuns', () => {
  it('splits Latin and Devanagari, keeping spaces with the run before them', () => {
    expect(scriptRuns('Asha आशा Verma')).toEqual([
      { text: 'Asha ', deva: false },
      { text: 'आशा ', deva: true },
      { text: 'Verma', deva: false },
    ]);
  });

  it('keeps vowel signs and the danda inside the Devanagari run', () => {
    expect(scriptRuns('रमेश।')).toEqual([{ text: 'रमेश।', deva: true }]);
  });

  it('attaches leading punctuation to the first run; handles empty and blank text', () => {
    expect(scriptRuns('(आशा)')).toEqual([{ text: '(आशा)', deva: true }]);
    expect(scriptRuns('')).toEqual([]);
    expect(scriptRuns('  ')).toEqual([{ text: '  ', deva: false }]);
  });

  it('treats the rupee sign as Latin text', () => {
    expect(scriptRuns('₹50,000')).toEqual([{ text: '₹50,000', deva: false }]);
  });
});

describe('renderWillPdf', () => {
  it('produces a readable PDF with the will text, the rupee sign and a numbered footer', async () => {
    const buf = await render(validWillPayload());
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    const { text, numpages } = await pdfParse(buf);
    expect(text).toContain('LAST WILL AND TESTAMENT');
    expect(text).toContain('Ramesh Kumar Verma');
    expect(text).toContain('₹50,000');
    expect(text).toContain('Not legal advice');
    expect(text).toContain(`Page 1 of ${numpages}`);
    expect(text).toContain(`Page ${numpages} of ${numpages}`);
  });

  it('embeds the Devanagari font for a Devanagari name and keeps the rupee sign', async () => {
    const m = validWillPayload();
    m.people[0]!.name = 'सुनीता वर्मा';
    const buf = await render(m);
    const raw = buf.toString('latin1');
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+NotoSansDevanagari-Regular/);
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+NotoSans-Regular/);
    const { text } = await pdfParse(buf);
    expect(text).toContain('₹50,000');
  });

  it('pins the creation date to the date of the will', async () => {
    const raw = (await render(validWillPayload())).toString('latin1');
    expect(raw).toContain('D:20261012000000Z');
  });
});
