import { describe, it, expect } from 'vitest';
import { inflateSync } from 'node:zlib';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { selectWillTemplate, WILL_PDF_FOOTER, type WillBlockV2, type WillPayload } from '@everypaisa/shared';
import { renderWillPdf } from '../../src/services/will/willPdf.js';
import { scriptRuns } from '../../src/services/will/willFonts.js';
import { TODAY, validWillPayload } from './willFixtures.js';
import { scenarioLarge } from './willScenarios.js';

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
  // pdfkit deflates every stream it writes (page content and embedded fonts). Each stream is read
  // by its declared /Length: searching for "endstream" can stop inside binary font data.
  for (const m of raw.matchAll(/\/Length (\d+)[^>]*>>\s*stream\r?\n/g)) {
    const start = m.index! + m[0].length;
    let body: string;
    try {
      body = inflateSync(Buffer.from(raw.slice(start, start + Number(m[1])), 'latin1')).toString('latin1');
    } catch {
      continue; // not a deflated stream
    }
    if (!/\bBT\b[\s\S]*\bET\b/.test(body)) continue;
    for (const h of body.matchAll(/<([0-9a-fA-F]+)>/g)) glyphs += h[1]!.length / 4;
  }
  return glyphs;
}

const HEAD = 'Last Will and Testament of Ramesh Kumar Verma';
const render = (m: WillPayload) =>
  renderWillPdf({ blocks: selectWillTemplate(m).render(m, { generatedOn: TODAY }), generatedOn: TODAY, footer: WILL_PDF_FOOTER, runningHead: HEAD });
const blocksOnly = (blocks: WillBlockV2[]) => renderWillPdf({ blocks, generatedOn: TODAY, footer: WILL_PDF_FOOTER, runningHead: HEAD });
const filler = (n: number): WillBlockV2[] => Array.from({ length: n }, (_, i) => ({ t: 'para' as const, text: `Filler line ${i + 1}.` }));
/** Letter-spaced headings extract with spaces between letters; compare without any whitespace. */
const bare = (t: string) => t.replace(/\s+/g, '');

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
    expect(bare(text)).toContain('LASTWILLANDTESTAMENT');
    expect(text).toContain('Ramesh Kumar Verma');
    expect(text).toContain('₹50,000');
    expect(text).toContain(`Page 1 of ${numpages}`);
    expect(text).toContain(`Page ${numpages} of ${numpages}`);
  });

  it('prints in the serif faces, with the Devanagari serif for a Devanagari name', async () => {
    const m = validWillPayload();
    m.people[0]!.name = 'सुनीता वर्मा';
    const buf = await render(m);
    const raw = buf.toString('latin1');
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+NotoSerifDevanagari-Regular/);
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+NotoSerif-Regular/);
    expect(raw).not.toMatch(/NotoSans-/);
    const { text } = await pdfParse(buf);
    expect(text).toContain('₹50,000');
  });

  it('is byte-identical across renders', async () => {
    const first = await render(validWillPayload());
    await new Promise((r) => setTimeout(r, 1100));
    expect((await render(validWillPayload())).equals(first)).toBe(true);
  });

  it('puts the initials strip and page number on every page, the disclaimer only on the last, the running head from page 2', async () => {
    const pages = await pageTexts(await render(validWillPayload()));
    expect(pages.length).toBeGreaterThan(1);
    pages.forEach((t, i) => {
      expect(t).toContain('Testator');
      expect(t).toContain('Witness 1');
      expect(t).toContain('Witness 2');
      expect(t).toContain(`Page ${i + 1} of ${pages.length}`);
      expect(t.includes('Not legal advice')).toBe(i === pages.length - 1);
      expect(t.includes(HEAD)).toBe(i > 0);
    });
    expect(pages.join(' ')).not.toContain('Signature of the Testator: ____');
  });

  it('H: keeps the testimonium, the testator signature and both witness blocks on one page, wherever the page breaks', async () => {
    const m = validWillPayload();
    const exec = selectWillTemplate(m).render(m, { generatedOn: TODAY }).filter((b) => b.t === 'execution');
    expect(exec).toHaveLength(1);
    for (let n = 1; n <= 45; n++) {
      const pages = await pageTexts(await blocksOnly([...filler(n), ...exec]));
      const page = pages.find((t) => t.includes('IN WITNESS WHEREOF'));
      const together = !!page
        && ['Place', 'SignatureoftheTestator', 'WITNESS1', 'WITNESS2', 'Ageandoccupation', 'Address'].every((s) => bare(page).includes(s));
      expect({ n, together }).toEqual({ n, together: true });
      // No page is ever left without content in front of it.
      expect(pages.every((t) => /Filler|IN WITNESS/.test(t))).toBe(true);
    }
  }, 60_000);

  it('never ends a page with a section heading, wherever the page breaks', async () => {
    const section: WillBlockV2 = {
      t: 'section', n: 7, title: 'Residuary estate',
      paras: [{ n: '7.1', text: 'I give all the rest and residue of my estate to the persons below.' }, { n: '7.2', text: 'Second paragraph.' }],
    };
    for (let n = 1; n <= 45; n++) {
      const page = (await pageTexts(await blocksOnly([...filler(n), section]))).find((t) => bare(t).includes('RESIDUARYESTATE'));
      expect({ n, together: !!page && page.includes('I give all the rest and residue') }).toEqual({ n, together: true });
    }
  }, 60_000);

  it('opens the Schedule on its own page and never leaves its heading without the first row', async () => {
    const schedule: WillBlockV2[] = [
      { t: 'heading', text: 'Schedule' },
      { t: 'note', text: 'Assets and liabilities known to me on 12/10/2026.' },
      {
        t: 'schedule', title: 'Part A - Assets', intro: null,
        columns: [{ label: 'No.', width: 0.1, align: 'left' }, { label: 'Description', width: 0.6, align: 'left' }, { label: 'Estimated value', width: 0.3, align: 'right' }],
        groups: [{ title: 'Bank accounts and deposits', rows: [['A1', 'First listed asset', '₹1,00,000'], ['A2', 'Second listed asset', '₹2,00,000']] }],
      },
    ];
    for (const n of [1, 10, 30, 45]) {
      const pages = await pageTexts(await blocksOnly([...filler(n), ...schedule]));
      const page = pages.find((t) => bare(t).includes('SCHEDULE'));
      expect(page).toBeDefined();
      expect(page).toContain('Assets and liabilities known');
      expect(page).toContain('First listed asset');
      expect(page).not.toContain('Filler');
    }
  }, 60_000);

  it('E: a large inventory runs over several pages, repeating the table header, with every item printed', async () => {
    const m = scenarioLarge();
    const pages = await pageTexts(await render(m));
    const continued = pages.filter((t) => bare(t).includes('(CONTINUED)'));
    expect(continued.length).toBeGreaterThan(1);
    for (const t of continued) {
      expect(t).toContain('Description');
      expect(t).toContain('Identifier');
    }
    const all = pages.join(' ');
    const assets = m.estate.items.filter((i) => i.side === 'ASSET').length;
    const liabilities = m.estate.items.filter((i) => i.side === 'LIABILITY').length;
    for (let i = 1; i <= assets; i++) expect(all).toMatch(new RegExp(`\\bA${i}\\b`));
    for (let i = 1; i <= liabilities; i++) expect(all).toMatch(new RegExp(`\\bL${i}\\b`));
    expect(all).toContain('Not valued');
  }, 60_000);

  it('writes words without ligature glyphs, so copied text is correct', async () => {
    const { text } = await pdfParse(await render(validWillPayload()));
    expect(text).toContain('beneficiary');
    expect(text).toContain('influence');
    // A ligature draws "ffi" as one glyph; some viewers then copy it as "i".
    // Same character count, with and without ligature pairs: same glyph count.
    const one = (t: string) => renderWillPdf({ blocks: [{ t: 'para', text: t }], generatedOn: TODAY, footer: '' });
    const plain = drawnGlyphs(await one('oxxxxx xxxxxx xxxxxxxxxxx'));
    expect(plain).toBeGreaterThanOrEqual(25);
    expect(drawnGlyphs(await one('office fluffy beneficiary'))).toBe(plain);
  });

  it('pins the creation date to the date of the will', async () => {
    const raw = (await render(validWillPayload())).toString('latin1');
    expect(raw).toContain('D:20261012000000Z');
  });
});
