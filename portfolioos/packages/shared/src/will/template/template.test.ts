import { describe, it, expect } from 'vitest';
import { regimeForLaw, renderWillSummary, selectWillTemplate, WILL_TEMPLATES } from './index.js';
import { renderWillText } from '../ast.js';
import { person, TODAY, validWillPayload } from '../__tests__/fixtures.js';
import type { WillPayload } from '../schema.js';

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
      'I, Ramesh Kumar Verma, born on 15/05/1970, residing at 12 MG Road, Pune 411001, a Hindu by religion, to whom Part VI of the Indian Succession Act, 1925 applies in terms of section 57 of that Act, make this my last Will and Testament on 12/10/2026.',
      'I revoke all Wills, codicils and other testamentary writings made by me before this Will.',
      'I am married.',
      'I appoint my spouse Sunita Verma, born on 01/08/1972, as the Executor of this Will.',
      'If Sunita Verma dies before me, or is unable or unwilling to act, I appoint my son Arjun Verma, born on 10/02/1998, as Executor in their place.',
      '- Equity - My Portfolio: Arjun Verma (son)',
      'I give Pune Animal Trust the sum of ₹50,000 (Fifty thousand rupees only).',
      '- Arjun Verma (son): 40%',
      '- Sunita Verma (spouse): 60%',
      'If Arjun Verma does not survive me, everything given to Arjun Verma under this Will shall go to my spouse Sunita Verma, born on 01/08/1972.',
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
    expect(text).toContain('If Arjun Verma dies before you, their gifts go to Sunita Verma.');
    expect(text).toContain('two adult witnesses');
  });
});
