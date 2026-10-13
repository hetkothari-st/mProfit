import { describe, it, expect } from 'vitest';
import { inflateSync } from 'node:zlib';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { selectWillTemplate, WILL_PDF_FOOTER, type WillBlock, type WillPayload } from '@everypaisa/shared';
import { renderWillPdf } from '../../src/services/will/willPdf.js';
import { scriptRuns } from '../../src/services/will/willFonts.js';
import { TODAY, validWillPayload } from './willFixtures.js';

interface PdfPage { getTextContent: () => Promise<{ items: Array<{ str: string }> }> }

/** Text of each page, in page order. */
async function pageTexts(buf: Buffer): Promise<string[]> {
  const pages: string[] = [];
  await pdfParse(buf, {
    pagerender: async (pageData: PdfPage) => {
      const text = (await pageData.getTextContent()).items.map((i) => i.str).join(' ');
      pages.push(text);
      return text;
    },
  });
  return pages;
}

/** Glyphs drawn by text operators across all page content streams. */
function drawnGlyphs(buf: Buffer): number {
  const raw = buf.toString('latin1');
  let glyphs = 0;
  // pdfkit deflates every stream it writes (page content and embedded fonts).
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const body = inflateSync(Buffer.from(m[1]!, 'latin1')).toString('latin1');
    if (!/\bBT\b[\s\S]*\bET\b/.test(body)) continue;
    for (const h of body.matchAll(/<([0-9a-fA-F]+)>/g)) glyphs += h[1]!.length / 4;
  }
  return glyphs;
}

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

  it('keeps zero-width joiners inside the run they join', () => {
    const ksha = String.fromCodePoint(0x915, 0x94d, 0x200d, 0x937);
    expect(scriptRuns(ksha)).toEqual([{ text: ksha, deva: true }]);
    const nonJoiner = String.fromCodePoint(0x915, 0x94d, 0x200c, 0x937);
    expect(scriptRuns(`Asha ${nonJoiner}`)).toEqual([{ text: 'Asha ', deva: false }, { text: nonJoiner, deva: true }]);
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

  it('is byte-identical across renders', async () => {
    const first = await render(validWillPayload());
    await new Promise((r) => setTimeout(r, 1100));
    expect((await render(validWillPayload())).equals(first)).toBe(true);
  });

  it('keeps the attestation sentence on the same page as the signature and witness blocks', async () => {
    const pages = await pageTexts(await render(validWillPayload()));
    const page = pages.find((t) => t.includes('In witness whereof'));
    expect(page).toBeDefined();
    expect(page).toContain('Place:');
    expect(page).toContain('Witness 1');
    expect(page).toContain('Witness 2');
  });

  it('never strands the attestation sentence away from the signature, wherever the page breaks', async () => {
    const m = validWillPayload();
    const all = selectWillTemplate(m).render(m, { generatedOn: TODAY });
    const tail = all.filter((x) => x.t === 'signature' || x.t === 'witnesses');
    expect(tail.map((x) => x.t)).toEqual(['signature', 'witnesses']);
    const attest = { t: 'para' as const, text: 'In witness whereof I have signed this Will on the date and at the place written below.' };
    for (let n = 1; n <= 45; n++) {
      const filler = Array.from({ length: n }, (_, i) => ({ t: 'para' as const, text: `Filler line ${i + 1}.` }));
      const buf = await renderWillPdf({ blocks: [...filler, attest, ...tail], generatedOn: TODAY, footer: WILL_PDF_FOOTER });
      const page = (await pageTexts(buf)).find((t) => t.includes('In witness whereof'));
      expect({ n, together: !!page && page.includes('Place:') && page.includes('Witness 1') && page.includes('Witness 2') })
        .toEqual({ n, together: true });
    }
  }, 30_000);

  it('never ends a page with the Schedule heading, wherever the page breaks', async () => {
    const schedule: WillBlock[] = [
      { t: 'heading', text: 'Schedule' },
      { t: 'para', text: 'Assets and liabilities known to me on 12/10/2026. Values are estimates for identification only; this list does not limit my residuary estate.' },
      { t: 'table', title: 'Assets', rows: [['First listed asset', '₹1,00,000'], ['Second listed asset', '₹2,00,000']] },
    ];
    for (let n = 1; n <= 45; n++) {
      const filler = Array.from({ length: n }, (_, i) => ({ t: 'para' as const, text: `Filler line ${i + 1}.` }));
      const buf = await renderWillPdf({ blocks: [...filler, ...schedule], generatedOn: TODAY, footer: WILL_PDF_FOOTER });
      const page = (await pageTexts(buf)).find((t) => /\bSchedule\b/.test(t));
      expect({ n, together: !!page && page.includes('Assets and liabilities known') && page.includes('First listed asset') })
        .toEqual({ n, together: true });
    }
  }, 30_000);

  it('writes words without ligature glyphs, so copied text is correct', async () => {
    const { text } = await pdfParse(await render(validWillPayload()));
    expect(text).toContain('beneficiary');
    expect(text).toContain('influence');
    // A ligature draws "ffi" as one glyph; some viewers then copy it as "i".
    // Same character count, with and without ligature pairs: same glyph count.
    const one = (t: string) => renderWillPdf({ blocks: [{ t: 'para', text: t }], generatedOn: TODAY, footer: WILL_PDF_FOOTER });
    expect(drawnGlyphs(await one('office fluffy beneficiary'))).toBe(drawnGlyphs(await one('oxxxxx xxxxxx xxxxxxxxxxx')));
  });

  it('pins the creation date to the date of the will', async () => {
    const raw = (await render(validWillPayload())).toString('latin1');
    expect(raw).toContain('D:20261012000000Z');
  });
});
