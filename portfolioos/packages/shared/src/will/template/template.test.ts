import { describe, it, expect } from 'vitest';
import { regimeForLaw, renderWillSummary, selectWillTemplate, WILL_TEMPLATES } from './index.js';
import { renderWillText } from '../ast.js';
import { item, person, TODAY, validWillPayload } from '../__tests__/fixtures.js';
import type { WillPayload } from '../schema.js';
import { ISA_HINDU_V1 } from './isaHindu.v1.js';
import { ISA_GENERAL_V1 } from './isaGeneral.v1.js';
import { inrFigure, moneyText, pctText } from './common.v1.js';
import { formatINR } from '../../format/number.js';
import { formatDateOnly } from '../../format/date.js';

const ctx = { generatedOn: TODAY };
const docText = (m: WillPayload) => renderWillText(selectWillTemplate(m).render(m, ctx));

describe('template selection', () => {
  it('maps personal law to a regime', () => {
    expect(regimeForLaw('HINDU')).toBe('ISA_HINDU');
    expect(regimeForLaw('SIKH')).toBe('ISA_HINDU');
    expect(regimeForLaw('JAIN')).toBe('ISA_HINDU');
    expect(regimeForLaw('BUDDHIST')).toBe('ISA_HINDU');
    expect(regimeForLaw('CHRISTIAN')).toBe('ISA_GENERAL');
    expect(regimeForLaw('PARSI')).toBe('ISA_GENERAL');
    expect(regimeForLaw('OTHER')).toBe('ISA_GENERAL');
    expect(regimeForLaw('MUSLIM')).toBeNull();
    expect(regimeForLaw(null)).toBeNull();
  });

  it('refuses Muslim personal law and an unset law', () => {
    const m = validWillPayload();
    m.details.personalLaw = 'MUSLIM';
    expect(() => selectWillTemplate(m)).toThrow('WILL_TEMPLATE_UNAVAILABLE');
    m.details.personalLaw = null;
    expect(() => selectWillTemplate(m)).toThrow('WILL_TEMPLATE_UNAVAILABLE');
  });

  it('lists one template per regime', () => {
    expect(WILL_TEMPLATES.map((t) => `${t.id}@${t.version}`)).toEqual(['isa-hindu@1', 'isa-general@1']);
  });
});

describe('isa-hindu v1', () => {
  const text = docText(validWillPayload());

  it('says the key things in plain sentences', () => {
    for (const line of [
      'LAST WILL AND TESTAMENT',
      'of Ramesh Kumar Verma',
      '1. Declaration',
      'I, Ramesh Kumar Verma, born on 15/05/1970, residing at 12 MG Road, Pune 411001, a Hindu by religion, to whom Part VI of the Indian Succession Act, 1925 applies in terms of section 57 of that Act, make this my last Will and Testament on the date written below.',
      'I revoke all Wills, codicils and other testamentary writings made by me before this Will.',
      'I am married.',
      'I appoint my spouse Sunita Verma, born on 01/08/1972, as the Executor of this Will.',
      'If Sunita Verma dies before me, or is unable or unwilling to act, I appoint my son Arjun Verma, born on 10/02/1998, as Executor in their place.',
      '- Equity - My Portfolio: Arjun Verma (son)',
      'I give Pune Animal Trust the sum of ₹50,000 (Fifty thousand rupees only).',
      '- Arjun Verma (son): 40%',
      '- Sunita Verma (spouse): 60%',
      'If Arjun Verma does not survive me by thirty days, everything given to Arjun Verma under this Will shall go to my spouse Sunita Verma, born on 01/08/1972.',
      'Additional wishes',
      'I wish my books to go to the Pune public library.',
      '- HDFC Bank savings account (XXXX1234): ₹2,50,000',
      '- Home loan - SBI: ₹4,00,000',
      'Signature of the Testator: ____________________',
      'Witness 2',
    ]) {
      expect(text).toContain(line);
    }
  });

  it('has no guardian clause without minor children, and no joint clause without joint assets', () => {
    expect(text).not.toContain('Guardian of my minor children');
    expect(text).not.toContain('Joint assets and nominations');
  });

  it('matches the golden snapshot', () => {
    expect(text).toMatchSnapshot();
  });
});

describe('isa-general v1', () => {
  it('uses the general Indian Succession Act declaration', () => {
    const m = validWillPayload();
    m.details.personalLaw = 'CHRISTIAN';
    const text = docText(m);
    expect(text).toContain('a Christian by religion, making this Will under the Indian Succession Act, 1925, make this my last Will');
    expect(text).not.toContain('section 57');
    expect(text).toMatchSnapshot();
  });
});

describe('optional clauses and determinism', () => {
  it('adds the guardian clause when there is a minor child and a guardian', () => {
    const m = validWillPayload();
    m.people.push(person({ id: 'kid', name: 'Meera Verma', relationship: 'DAUGHTER', dob: '2016-03-03' }));
    m.roles.guardianId = 'p-spouse';
    expect(docText(m)).toContain(
      'If any of my children is under eighteen years of age at my death, I appoint my spouse Sunita Verma, born on 01/08/1972, as the guardian of the person and property of that child.',
    );
  });

  it('adds the joint-assets clause and shows the share in the schedule', () => {
    const m = validWillPayload();
    m.estate.items[0]!.ownership = { type: 'JOINT', sharePct: '50' };
    const text = docText(m);
    expect(text).toContain('Where I hold an asset jointly with another person, only my share of it passes under this Will.');
    expect(text).toContain('- HDFC Bank savings account (XXXX1234): ₹2,50,000 (my share 50%)');
  });

  it('does not depend on the order people or shares were entered', () => {
    const a = validWillPayload();
    const b = validWillPayload();
    b.people.reverse();
    b.allocation.residuary.reverse();
    b.estate.items.reverse();
    expect(docText(b)).toBe(docText(a));
  });

  it('prints paise when a money gift has them', () => {
    const m = validWillPayload();
    m.allocation.fixedGifts[0]!.amount = '1000.50';
    expect(docText(m)).toContain('the sum of ₹1,000.50 (One thousand rupees and fifty paise only).');
  });
});

describe('summary v1', () => {
  it('describes the same choices in plain words', () => {
    const text = renderWillText(renderWillSummary(validWillPayload(), ctx));
    expect(text).toContain('Sunita Verma will carry out your will as executor, with Arjun Verma as back-up.');
    expect(text).toContain('Equity - My Portfolio goes to Arjun Verma.');
    expect(text).toContain('Pune Animal Trust receives ₹50,000.');
    expect(text).toContain('Everything else is shared: Arjun Verma 40%, Sunita Verma 60%.');
    expect(text).toContain('If Arjun Verma dies before you or within thirty days of you, their gifts go to Sunita Verma.');
    expect(text).toContain('two adult witnesses');
  });
});

/** Every optional clause and table variant at once. */
function loadedPayload(law: 'HINDU' | 'CHRISTIAN'): WillPayload {
  const m = validWillPayload();
  m.details.personalLaw = law;
  m.people.push(
    person({ id: 'p-kid', name: 'Meera Verma', relationship: 'DAUGHTER', dob: '2016-03-03', contingentId: 'p-son' }),
    person({ id: 'p-bro', name: 'Vikas Verma', relationship: 'BROTHER', dob: '1968-11-20' }),
    person({ id: 'p-friend', name: 'Anil Shah', relationship: 'FRIEND', dob: null }),
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
  m.allocation.fixedGifts.push({ personId: 'p-friend', amount: '25000.75' });
  m.instructions.text = 'I wish my books to go to the Pune public library.\nPlease keep the family home for my children.';
  return m;
}

describe('fully loaded golden wills', () => {
  it('isa-hindu v1, every clause', () => {
    const text = docText(loadedPayload('HINDU'));
    for (const line of [
      'If any of my children is under eighteen years of age at my death, I appoint my spouse Sunita Verma, born on 01/08/1972, as the guardian of the person and property of that child.',
      'If Sunita Verma is unable or unwilling to act, I appoint my brother Vikas Verma, born on 20/11/1968, as guardian in their place.',
      '- Honda City (MH12AB1234): Meera Verma (daughter) - 50%',
      '- Honda City (MH12AB1234): Vikas Verma (brother) - 50%',
      '- LIC term policy (XXXX9876): ₹1,00,00,000 (paid to the nominee)',
      '- Ancestral land, Satara: ₹20,00,000 (my share 25%)',
      '- Flat 4B, Shanti Apartments, Pune: ₹85,00,000 (my share 50%)',
      'I give my friend Anil Shah the sum of ₹25,000.75 (Twenty-five thousand rupees and seventy-five paise only).',
      'I give Pune Animal Trust the sum of ₹50,000 (Fifty thousand rupees only).',
      'My interest in any Hindu Undivided Family property passes under this Will only to the extent the law allows me to dispose of it.',
    ]) {
      expect(text).toContain(line);
    }
    expect(text).toMatchSnapshot();
  });

  it('isa-general v1, every clause', () => {
    expect(docText(loadedPayload('CHRISTIAN'))).toMatchSnapshot();
  });

  it('summary v1, every line', () => {
    expect(renderWillText(renderWillSummary(loadedPayload('HINDU'), ctx))).toMatchSnapshot();
  });
});

describe('review fixes (round 1)', () => {
  it('ties the back-up gift to the thirty-day survival period', () => {
    const text = docText(validWillPayload());
    expect(text).toContain('A person must survive me by thirty days to receive anything under this Will.');
    expect(text).toContain('If Arjun Verma does not survive me by thirty days, everything given to Arjun Verma');
    expect(text).not.toMatch(/does not survive me, /);
    const summary = renderWillText(renderWillSummary(validWillPayload(), ctx));
    expect(summary).toContain('If Arjun Verma dies before you or within thirty days of you, their gifts go to Sunita Verma.');
  });

  it('frames additional wishes so they cannot override the gifts, user lines kept as paragraphs', () => {
    const m = validWillPayload();
    m.instructions.text = 'First wish.\n\n  Second wish.  ';
    const blocks = selectWillTemplate(m).render(m, ctx);
    const wishes = blocks.find((b) => b.t === 'clause' && b.title === 'Additional wishes');
    expect(wishes).toEqual({
      t: 'clause',
      n: expect.any(Number),
      title: 'Additional wishes',
      paras: [
        'The following are my wishes. They do not alter or revoke any gift made above in this Will, and if anything below conflicts with those gifts, the gifts above prevail.',
        'First wish.',
        'Second wish.',
      ],
    });
  });

  it('prints no generation date in the declaration, only the blank signature date', () => {
    const text = docText(validWillPayload());
    expect(text).toContain('make this my last Will and Testament on the date written below.');
    expect(text).not.toContain(`Testament on ${formatDateOnly(TODAY)}`);
    expect(text).toContain('Date: ____________________');
  });

  it('pays debts before any gift', () => {
    expect(docText(validWillPayload())).toContain(
      'My Executor shall pay my debts, funeral and testamentary expenses, and any taxes due from my estate out of my residuary estate, before any gift in this Will is paid or transferred and before the residue is divided.',
    );
  });

  it('refuses to render a regime template for a personal law it does not cover', () => {
    const m = validWillPayload();
    m.details.personalLaw = 'CHRISTIAN';
    expect(() => ISA_HINDU_V1.render(m, ctx)).toThrow('WILL_TEMPLATE_LAW_MISMATCH');
    m.details.personalLaw = 'HINDU';
    expect(() => ISA_GENERAL_V1.render(m, ctx)).toThrow('WILL_TEMPLATE_LAW_MISMATCH');
    m.details.personalLaw = 'MUSLIM';
    expect(() => ISA_HINDU_V1.render(m, ctx)).toThrow('WILL_TEMPLATE_LAW_MISMATCH');
    expect(() => ISA_GENERAL_V1.render(m, ctx)).toThrow('WILL_TEMPLATE_LAW_MISMATCH');
    m.details.personalLaw = null;
    expect(() => ISA_GENERAL_V1.render(m, ctx)).toThrow('WILL_TEMPLATE_LAW_MISMATCH');
  });

  it('puts typed names, labels, addresses and refs on one line', () => {
    const m = validWillPayload();
    m.details.legalName = 'Ramesh Kumar\nVerma';
    m.details.address = '12 MG Road,\r\n\tPune 411001';
    m.people[0]!.name = 'Sunita\nVerma';
    m.estate.items[0]!.label = 'HDFC Bank\nsavings account';
    m.estate.items[0]!.ref = 'XXXX\u00001234';
    const text = docText(m);
    expect(text).toContain('I, Ramesh Kumar Verma, born on 15/05/1970, residing at 12 MG Road, Pune 411001, a Hindu');
    expect(text).toContain('I appoint my spouse Sunita Verma, born on 01/08/1972, as the Executor of this Will.');
    expect(text).toContain('- HDFC Bank savings account (XXXX 1234): ₹2,50,000');
    expect(text).toContain('(Ramesh Kumar Verma)');
    expect(text).not.toContain('Sunita\nVerma');
    const summary = renderWillText(renderWillSummary(m, ctx));
    expect(summary).toContain('Sunita Verma will carry out your will as executor');
    const a = validWillPayload();
    a.people[0]!.name = 'A\nB';
    expect(docText(a)).toContain('I appoint my spouse A B, born on 01/08/1972, as the Executor of this Will.');
  });

  it('orders specific and fixed gifts the same whatever the input order', () => {
    const a = loadedPayload('HINDU');
    // Same label on two items: the sourceKey breaks the tie.
    a.estate.items.push(item({ sourceKey: 'manual:z', kind: 'OTHER_ASSET', label: 'Honda City', value: '1.00' }));
    a.allocation.specificGifts.push({ itemId: 'manual:z', personId: 'p-spouse', sharePct: '100' });
    a.allocation.fixedGifts.push({ personId: 'p-friend', amount: '10.00' });
    const b = structuredClone(a);
    b.people.reverse();
    b.estate.items.reverse();
    b.allocation.specificGifts.reverse();
    b.allocation.fixedGifts.reverse();
    b.allocation.residuary.reverse();
    expect(docText(b)).toBe(docText(a));
    expect(renderWillText(renderWillSummary(b, ctx))).toBe(renderWillText(renderWillSummary(a, ctx)));
  });

  it('sorts names by code units, not the runtime locale', () => {
    const m = validWillPayload();
    m.people.push(
      person({ id: 'p-a', name: 'ärjun', relationship: 'NEPHEW', dob: null }),
      person({ id: 'p-b', name: 'Zoya', relationship: 'NIECE', dob: null }),
    );
    const text = docText(m);
    expect(text.indexOf('Zoya')).toBeLessThan(text.indexOf('ärjun'));
  });
});

describe('formatting canary (strings the will prints through shared formatters)', () => {
  it('formats money, words, percentages and dates exactly', () => {
    expect(formatINR('250000.00', { fractionDigits: 0 })).toBe('₹2,50,000');
    expect(formatINR('10000000', { fractionDigits: 0 })).toBe('₹1,00,00,000');
    expect(formatINR('1000.5', { fractionDigits: 2 })).toBe('₹1,000.50');
    expect(inrFigure('250000.00')).toBe('₹2,50,000');
    expect(inrFigure('25000.75')).toBe('₹25,000.75');
    expect(moneyText('50000')).toBe('₹50,000 (Fifty thousand rupees only)');
    expect(moneyText('1000.50')).toBe('₹1,000.50 (One thousand rupees and fifty paise only)');
    expect(pctText('33.50')).toBe('33.50%');
    expect(pctText('60')).toBe('60%');
    expect(formatDateOnly('2026-10-12')).toBe('12/10/2026');
    expect(formatDateOnly('1970-05-15')).toBe('15/05/1970');
  });
});
