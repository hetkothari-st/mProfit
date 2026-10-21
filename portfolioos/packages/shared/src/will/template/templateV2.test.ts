import { describe, it, expect } from 'vitest';
import { renderWillSummary, selectWillTemplate } from './index.js';
import { renderWillText } from '../ast.js';
import { renderWillTextV2, type WillBlockV2 } from '../astV2.js';
import { item, person, TODAY, validWillPayload } from '../__tests__/fixtures.js';
import type { WillPayload } from '../schema.js';
import { ISA_HINDU_V2 } from './isaHindu.v2.js';
import { ISA_GENERAL_V2 } from './isaGeneral.v2.js';

const ctx = { generatedOn: TODAY };
const blocksOf = (m: WillPayload) => selectWillTemplate(m).render(m, ctx);
const docText = (m: WillPayload) => renderWillTextV2(blocksOf(m));
const sections = (m: WillPayload) =>
  blocksOf(m).filter((b): b is Extract<WillBlockV2, { t: 'section' }> => b.t === 'section');
const section = (m: WillPayload, title: string) => sections(m).find((s) => s.title === title);
const schedules = (m: WillPayload) =>
  blocksOf(m).filter((b): b is Extract<WillBlockV2, { t: 'schedule' }> => b.t === 'schedule');

/** Every optional clause at once: minor child + guardian, joint/HUF/nominee items, split and whole gifts. */
function loadedPayload(law: 'HINDU' | 'CHRISTIAN' = 'HINDU'): WillPayload {
  const m = validWillPayload();
  m.details.personalLaw = law;
  m.people.push(
    person({ id: 'p-kid', name: 'Meera Verma', relationship: 'DAUGHTER', dob: '2016-03-03', contingentId: 'p-son' }),
    person({ id: 'p-bro', name: 'Vikas Verma', relationship: 'BROTHER', dob: '1968-11-20' }),
  );
  m.roles.guardianId = 'p-spouse';
  m.roles.altGuardianId = 'p-bro';
  m.estate.items.push(
    item({ sourceKey: 'property:h1', kind: 'OWNED_PROPERTY', label: 'Flat 4B, Shanti Apartments, Pune', value: '8500000.00', ownership: { type: 'JOINT', sharePct: '50' } }),
    item({ sourceKey: 'insurance:i1', kind: 'INSURANCE', label: 'LIC term policy', ref: 'XXXX9876', value: '10000000.00', ownership: { type: 'NOMINEE_ONLY', sharePct: '100' } }),
    item({ sourceKey: 'property:huf1', kind: 'OWNED_PROPERTY', label: 'Ancestral land, Satara', value: '2000000.00', ownership: { type: 'HUF', sharePct: '25' } }),
    item({ sourceKey: 'vehicle:v1', kind: 'VEHICLE', label: 'Honda City', ref: 'MH12AB1234', value: '650000.00' }),
  );
  m.allocation.specificGifts.push(
    { itemId: 'vehicle:v1', personId: 'p-kid', sharePct: '50' },
    { itemId: 'vehicle:v1', personId: 'p-bro', sharePct: '50' },
    { itemId: 'property:h1', personId: 'p-spouse', sharePct: '100' },
  );
  return m;
}

describe('template v2 selection', () => {
  it('is the current template for both regimes', () => {
    expect(selectWillTemplate(validWillPayload())).toBe(ISA_HINDU_V2);
    const m = validWillPayload();
    m.details.personalLaw = 'PARSI';
    expect(selectWillTemplate(m)).toBe(ISA_GENERAL_V2);
  });

  it('refuses a personal law its regime does not cover', () => {
    const m = validWillPayload();
    m.details.personalLaw = 'CHRISTIAN';
    expect(() => ISA_HINDU_V2.render(m, ctx)).toThrow('WILL_TEMPLATE_LAW_MISMATCH');
    m.details.personalLaw = 'HINDU';
    expect(() => ISA_GENERAL_V2.render(m, ctx)).toThrow('WILL_TEMPLATE_LAW_MISMATCH');
  });
});

describe('A: basic will', () => {
  const m = validWillPayload();
  const text = docText(m);

  it('opens with the title and an identifying recital, not a dated declaration', () => {
    expect(text.startsWith('LAST WILL AND TESTAMENT\n\nof Ramesh Kumar Verma\n\n')).toBe(true);
    expect(text).toContain(
      'I, Ramesh Kumar Verma, born on 15/05/1970, residing at 12 MG Road, Pune 411001, a Hindu by religion, to whom Part VI of the Indian Succession Act, 1925 applies in terms of section 57 of that Act, make this my last Will and Testament on the date written at its end.',
    );
    expect(text).not.toContain(TODAY);
    expect(text).not.toContain('12/10/2026 make');
  });

  it('numbers the sections in order with sub-clauses only where a section has several paragraphs', () => {
    expect(sections(m).map((s) => `${s.n}. ${s.title}`)).toEqual([
      '1. Revocation', '2. Capacity and free will', '3. My family', '4. Executor', '5. Specific gifts',
      '6. Gifts of money', '7. Residuary estate', '8. Survivorship and failed gifts', '9. Debts and expenses',
      '10. Additional wishes', '11. Interpretation',
    ]);
    expect(section(m, 'Revocation')!.paras).toEqual([{ n: '', text: 'I revoke all Wills, codicils and other testamentary dispositions made by me before this Will.' }]);
    expect(section(m, 'Executor')!.paras.map((p) => p.n)).toEqual(['4.1', '4.2', '4.3']);
  });

  it('states capacity in the terms of section 59 (sound mind, not a minor)', () => {
    expect(text).toContain('I am of sound mind and memory and I am not a minor.');
  });

  it('ends with one execution block: place and date blank, two witnesses, nothing pre-filled', () => {
    const blocks = blocksOf(m);
    const last = blocks[blocks.length - 1]!;
    expect(last.t).toBe('execution');
    if (last.t !== 'execution') return;
    expect(last.fields).toEqual(['Place', 'Date']);
    expect(last.witnessCount).toBe(2);
    expect(last.witnessFields).toEqual(['Signature', 'Full name', 'Age and occupation', 'Address', 'Date']);
    expect(text).toContain('Place: ____________________\nDate: ____________________\nSignature of the Testator: ____________________\n(Ramesh Kumar Verma)');
    expect(blocks.filter((b) => b.t === 'signature' || b.t === 'witnesses')).toEqual([]);
  });

  it('prints the parentage only when both the relation and the name are given', () => {
    const p = validWillPayload();
    p.details.parentage = { relation: 'DAUGHTER_OF', name: 'Mohan Lal Verma' };
    expect(docText(p)).toContain('I, Ramesh Kumar Verma, daughter of Mohan Lal Verma, born on');
    p.details.parentage = { relation: 'DAUGHTER_OF', name: '  ' };
    expect(docText(p)).toContain('I, Ramesh Kumar Verma, born on');
    p.details.parentage = { relation: null, name: 'Mohan Lal Verma' };
    expect(docText(p)).not.toContain('Mohan Lal');
  });

  it('is deterministic whatever order things were entered in', () => {
    const a = loadedPayload();
    const b = structuredClone(a);
    b.people.reverse();
    b.estate.items.reverse();
    b.allocation.specificGifts.reverse();
    b.allocation.residuary.reverse();
    expect(docText(b)).toBe(docText(a));
  });
});

describe('B: specific and residuary gifts', () => {
  const m = loadedPayload();
  const text = docText(m);

  it('writes each specific gift as its own sentence tied to a Schedule item, in Schedule order', () => {
    const gifts = section(m, 'Specific gifts')!.paras.slice(1).map((p) => `${p.n} ${p.text}`);
    expect(gifts).toEqual([
      '6.2 I give all my share and interest in Flat 4B, Shanti Apartments, Pune (Schedule item A2) to my spouse Sunita Verma, born on 01/08/1972.',
      '6.3 I give Equity - My Portfolio (Schedule item A4) to my son Arjun Verma, born on 10/02/1998.',
      '6.4 I give a 50% share of Honda City, MH12AB1234 (Schedule item A6) to my daughter Meera Verma, born on 03/03/2016.',
      '6.5 I give a 50% share of Honda City, MH12AB1234 (Schedule item A6) to my brother Vikas Verma, born on 20/11/1968.',
    ]);
  });

  it('shows in the Schedule which clause disposes of each item, and the residue for the rest', () => {
    const assets = schedules(m)[0]!;
    const row = (no: string) => assets.groups.flatMap((g) => g.rows).find((r) => r[0] === no)!;
    expect(row('A2')[4]).toBe('Clause 6.2 - Sunita Verma');
    expect(row('A1')[4]).toBe('Residue (clause 8)');
    expect(row('A3')[4]).toBe('Residue (clause 8)');
    expect(row('A6')[4]).toBe('Clause 6.4 - Meera Verma (50%); Clause 6.5 - Vikas Verma (50%)');
  });

  it('gives the residue in the saved shares, one line per beneficiary', () => {
    expect(section(m, 'Residuary estate')!.paras.slice(1).map((p) => p.text)).toEqual([
      'To my son Arjun Verma, born on 10/02/1998: a 40% share.',
      'To my spouse Sunita Verma, born on 01/08/1972: a 60% share.',
    ]);
    expect(text).toContain('any gift that fails, and any property I acquire after making this Will');
  });

  it('never gives an asset twice: each gift line appears once', () => {
    const lines = text.split('\n').filter((l) => l.includes('I give '));
    expect(new Set(lines).size).toBe(lines.length);
  });
});

describe('C: contingencies', () => {
  const m = loadedPayload();
  const s = section(m, 'Survivorship and failed gifts')!;

  it('uses the saved survival period and names a back-up only where one was chosen', () => {
    expect(s.paras[0]!.text).toBe('A person must survive me by thirty (30) days to receive any gift under this Will. A person who does not is treated as having died before me.');
    const backups = s.paras.filter((p) => p.text.includes('shall go instead to')).map((p) => p.text);
    // Arjun -> Sunita and Meera -> Arjun were chosen; Sunita and Vikas have no back-up and get no line.
    expect(backups).toEqual([
      'If Arjun Verma does not receive a gift because of clause 9.1, every gift to Arjun Verma under this Will shall go instead to my spouse Sunita Verma, born on 01/08/1972, who must also meet clause 9.1.',
      'If Meera Verma does not receive a gift because of clause 9.1, every gift to Meera Verma under this Will shall go instead to my son Arjun Verma, born on 10/02/1998, who must also meet clause 9.1.',
    ]);
  });

  it('sends other failed gifts to the residue and says what happens if the whole residue fails', () => {
    const t = s.paras.map((p) => p.text).join('\n');
    expect(t).toContain('falls into my residuary estate. If a share of my residuary estate fails, it shall be added to the shares of the other residuary beneficiaries');
    expect(t).toContain('If the whole of my residuary estate fails, it shall pass to my legal heirs under the law of succession that applies to me.');
  });

  it('prints any offered period, and no period at all for 0', () => {
    const p = validWillPayload();
    p.allocation.survivalDays = 90;
    expect(docText(p)).toContain('survive me by ninety (90) days');
    p.allocation.survivalDays = 7;
    expect(docText(p)).toContain('survive me by seven (7) days');
    p.allocation.survivalDays = 0;
    expect(docText(p)).toContain('A person must survive me to receive any gift under this Will.');
    expect(docText(p)).not.toMatch(/\(\d+\) days/);
    expect(renderWillText(renderWillSummary(p, ctx) as never)).toContain('If Arjun Verma dies before you, their gifts go to Sunita Verma.');
  });
});

describe('D: minor children and guardianship', () => {
  it('appoints the guardian, hedged to what the law allows, when there is a minor child', () => {
    const m = loadedPayload();
    expect(section(m, 'Guardian of my minor children')!.paras.map((p) => p.text)).toEqual([
      'If any child of mine is a minor at my death, I appoint my spouse Sunita Verma, born on 01/08/1972, as the guardian of the person and property of that child, to the extent the law allows me to make this appointment.',
      'If Sunita Verma is unable or unwilling to act, I appoint my brother Vikas Verma, born on 20/11/1968, as guardian in their place.',
    ]);
  });

  it('has no guardian section without a minor child, even if a guardian was saved', () => {
    const m = validWillPayload();
    m.roles.guardianId = 'p-spouse';
    expect(section(m, 'Guardian of my minor children')).toBeUndefined();
  });
});

describe('F: missing data is never filled in', () => {
  it('leaves out the executor section rather than inventing one (validation blocks generation separately)', () => {
    const m = validWillPayload();
    m.roles.executorId = null;
    m.roles.altExecutorId = null;
    expect(section(m, 'Executor')).toBeUndefined();
    expect(docText(m)).not.toMatch(/as the Executor of this Will/);
  });

  it('prints "Not valued" for an item with no value instead of a zero amount', () => {
    const m = validWillPayload();
    m.estate.items[0]!.value = '0.00';
    const rows = schedules(m)[0]!.groups.flatMap((g) => g.rows);
    expect(rows.find((r) => r[1] === 'HDFC Bank savings account')![5]).toBe('Not valued');
    expect(docText(m)).not.toContain('₹0');
  });

  it('prints "-" where no identifier is recorded, and leaves out empty categories', () => {
    const m = validWillPayload();
    const assets = schedules(m)[0]!;
    expect(assets.groups.map((g) => g.title)).toEqual(['Bank accounts and deposits', 'Shares, mutual funds and other investments']);
    expect(assets.groups[1]!.rows[0]![2]).toBe('-');
  });

  it('has no schedule and no Part B reference when there are no items', () => {
    const m = validWillPayload();
    m.estate.items = [];
    m.allocation.specificGifts = [];
    const text = docText(m);
    expect(schedules(m)).toEqual([]);
    expect(text).not.toContain('Schedule');
  });

  it('keeps excluded items out of the will entirely', () => {
    const m = validWillPayload();
    m.estate.items[0]!.review = 'EXCLUDED';
    expect(docText(m)).not.toContain('HDFC Bank savings account');
  });
});

describe('G: joint assets and nominations', () => {
  const m = loadedPayload();
  const rows = schedules(m)[0]!.groups.flatMap((g) => g.rows);
  const row = (label: string) => rows.find((r) => r[1].startsWith(label))!;

  it('records the holding of every item instead of calling everything mine', () => {
    expect(row('Flat 4B')[3]).toBe('Joint - my share 50%');
    expect(row('Ancestral land')[3]).toBe('HUF - my share 25%');
    expect(row('LIC term policy')[3]).toBe('Payable to nominee');
    expect(row('HDFC Bank')[3]).toBe('Sole');
  });

  it('says the insurance value is the sum assured and that it passes by nomination', () => {
    expect(row('LIC term policy')[1]).toBe('LIC term policy (value shown is the sum assured)');
    expect(row('LIC term policy')[4]).toBe('Nomination (clause 11)');
  });

  it('gives only "my share" of a joint asset and explains joint, nominee and HUF property', () => {
    const text = docText(m);
    expect(text).toContain('I give all my share and interest in Flat 4B, Shanti Apartments, Pune (Schedule item A2)');
    expect(section(m, 'Joint assets and nominations')!.paras.map((p) => p.text)).toEqual([
      'Where I hold an asset jointly with another person, only my share of it passes under this Will.',
      'A person registered as my nominee for any bank account, deposit, insurance policy, provident fund or investment shall hold what they receive for the persons entitled under this Will, except where the law makes the nominee its owner.',
      'My interest in any Hindu Undivided Family property passes under this Will only to the extent the law allows me to dispose of it.',
    ]);
  });

  it('groups the schedule by category with continuous item numbers', () => {
    const [assets, liabilities] = schedules(m);
    expect(assets!.groups.map((g) => [g.title, g.rows.map((r) => r[0])])).toEqual([
      ['Immovable property', ['A1', 'A2']],
      ['Bank accounts and deposits', ['A3']],
      ['Shares, mutual funds and other investments', ['A4']],
      ['Insurance policies', ['A5']],
      ['Vehicles', ['A6']],
    ]);
    expect(liabilities!.title).toBe('Part B - Liabilities');
    expect(liabilities!.groups).toEqual([{ title: 'Loans', rows: [['L1', 'Home loan - SBI', '-', '₹4,00,000']] }]);
  });
});

describe('golden v2 wills', () => {
  it('isa-hindu v2, every clause', () => {
    expect(docText(loadedPayload('HINDU'))).toMatchSnapshot();
  });

  it('isa-general v2, every clause', () => {
    const text = docText(loadedPayload('CHRISTIAN'));
    expect(text).toContain('a Christian by religion, making this Will under the Indian Succession Act, 1925, make this my last Will');
    expect(text).not.toContain('section 57');
    expect(text).toMatchSnapshot();
  });
});

describe('text of v1 blocks is unchanged by the v2 text renderer', () => {
  it('renders a v1-only block list exactly as renderWillText does', () => {
    const v1 = [
      { t: 'title', text: 'Last Will and Testament' },
      { t: 'clause', n: 1, title: 'Declaration', paras: ['A.', 'B.  '] },
      { t: 'table', title: 'Assets', rows: [['x', 'y']] },
      { t: 'signature', lines: ['Place: __', '', '(N)'] },
      { t: 'witnesses', intro: 'I', count: 2, fields: ['Signature'] },
      { t: 'note', text: 'n' },
    ] as const;
    expect(renderWillTextV2([...v1])).toBe(renderWillText([...v1]));
  });
});
