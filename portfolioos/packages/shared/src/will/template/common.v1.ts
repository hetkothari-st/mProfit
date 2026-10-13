/**
 * Will template v1 - clause builders shared by every v1 regime.
 *
 * LOCKED (LOCK.json, checked by packages/api/test/will/templateLock.test.ts):
 * these words are what people sign. To change them, add common.v2.ts, point a
 * new template version at it, and lock the new file. Never edit this file.
 * Release gate: the text is reviewed by a qualified Indian advocate before launch.
 */
import { Decimal } from '../../decimal.js';
import { formatINR } from '../../format/number.js';
import { formatDateOnly } from '../../format/date.js';
import { amountInWords } from '../../amountInWords.js';
import type { WillBlock } from '../ast.js';
import {
  WILL_ESTATE_KINDS,
  type MaritalStatus, type WillAssetItem, type WillPayload, type WillPerson, type WillRelationship,
} from '../schema.js';
import { willMinorChildren } from '../estateMath.js';

export interface WillRenderContext {
  /** YYYY-MM-DD; the day the will is generated (minor children, schedule date). Never printed as the will's date. */
  generatedOn: string;
}

const RELATIONSHIP_WORDS: Record<WillRelationship, string> = {
  SPOUSE: 'spouse', SON: 'son', DAUGHTER: 'daughter', FATHER: 'father', MOTHER: 'mother',
  BROTHER: 'brother', SISTER: 'sister', GRANDSON: 'grandson', GRANDDAUGHTER: 'granddaughter',
  SON_IN_LAW: 'son-in-law', DAUGHTER_IN_LAW: 'daughter-in-law', NEPHEW: 'nephew', NIECE: 'niece',
  OTHER_RELATIVE: 'relative', FRIEND: 'friend', CHARITY: '', OTHER: '',
};

const NOT_FAMILY: ReadonlySet<WillRelationship> = new Set<WillRelationship>(['FRIEND', 'CHARITY', 'OTHER']);

const MARITAL_WORDS: Record<MaritalStatus, string> = {
  SINGLE: 'unmarried',
  MARRIED: 'married',
  WIDOWED: 'widowed',
  DIVORCED: 'divorced',
  SEPARATED: 'separated from my spouse',
};

/** Text the user typed, on one line: line breaks, tabs and control characters become single spaces. */
export function oneLine(s: string): string {
  return s.replace(/[\s\p{Cc}]+/gu, ' ').trim();
}

/** Locale-independent order: lowercased code units first, then exact code units. */
export function cmpText(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x !== y) return x < y ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function personName(p: WillPerson): string {
  return oneLine(p.name);
}

export function byName(a: WillPerson, b: WillPerson): number {
  return cmpText(personName(a), personName(b)) || cmpText(a.id, b.id);
}

function byKindThenLabel(a: WillAssetItem, b: WillAssetItem): number {
  return WILL_ESTATE_KINDS.indexOf(a.kind) - WILL_ESTATE_KINDS.indexOf(b.kind)
    || cmpText(oneLine(a.label), oneLine(b.label))
    || cmpText(a.sourceKey, b.sourceKey);
}

/** "my son Arjun Verma, born on 10/02/1998" - used where the will names someone formally. */
export function describePerson(p: WillPerson): string {
  if (p.partyType === 'ORGANISATION') return personName(p);
  const rel = RELATIONSHIP_WORDS[p.relationship];
  const born = p.dob ? `, born on ${formatDateOnly(p.dob)}` : '';
  return rel ? `my ${rel} ${personName(p)}${born}` : `${personName(p)}${born}`;
}

/** describePerson inside a sentence: "my son Arjun Verma, born on 10/02/1998, as ..." closes the aside. */
function describePersonInline(p: WillPerson): string {
  const s = describePerson(p);
  return p.partyType !== 'ORGANISATION' && p.dob ? `${s},` : s;
}

/** "Arjun Verma (son)" - used in tables. */
export function namePerson(p: WillPerson): string {
  const rel = RELATIONSHIP_WORDS[p.relationship];
  return p.partyType === 'INDIVIDUAL' && rel ? `${personName(p)} (${rel})` : personName(p);
}

export function pctText(v: string): string {
  return `${new Decimal(v).toFixed(2).replace(/\.00$/, '')}%`;
}

export function inrFigure(v: string): string {
  return formatINR(v, { fractionDigits: new Decimal(v).isInteger() ? 0 : 2 });
}

export function moneyText(v: string): string {
  return `${inrFigure(v)} (${amountInWords(new Decimal(v).toFixed(2))})`;
}

export function itemText(i: WillAssetItem): string {
  const ref = i.ref ? oneLine(i.ref) : '';
  return ref ? `${oneLine(i.label)} (${ref})` : oneLine(i.label);
}

function scheduleValue(i: WillAssetItem): string {
  const base = inrFigure(i.value);
  if (i.ownership.type === 'JOINT' || i.ownership.type === 'HUF') return `${base} (my share ${pctText(i.ownership.sharePct)})`;
  if (i.ownership.type === 'NOMINEE_ONLY') return `${base} (paid to the nominee)`;
  return base;
}

interface Resolved {
  people: Map<string, WillPerson>;
  get(id: string | null): WillPerson | null;
}

function resolve(m: WillPayload): Resolved {
  const people = new Map(m.people.map((p) => [p.id, p]));
  return { people, get: (id) => (id ? people.get(id) ?? null : null) };
}

export interface ResolvedGifts {
  specific: Array<{ item: WillAssetItem; who: WillPerson; pct: string }>;
  fixed: Array<{ who: WillPerson; amount: string }>;
  residuary: Array<{ who: WillPerson; pct: string }>;
  backups: Array<{ who: WillPerson; backup: WillPerson }>;
}

/** Gifts joined to their people and items, in a fixed order (input order never matters). */
export function resolveGifts(m: WillPayload): ResolvedGifts {
  const r = resolve(m);
  const items = new Map(m.estate.items.map((i) => [i.sourceKey, i]));
  const specific: ResolvedGifts['specific'] = [];
  for (const g of m.allocation.specificGifts) {
    const item = items.get(g.itemId);
    const who = r.get(g.personId);
    if (item && who) specific.push({ item, who, pct: g.sharePct });
  }
  specific.sort(
    (a, b) => cmpText(oneLine(a.item.label), oneLine(b.item.label))
      || cmpText(a.item.sourceKey, b.item.sourceKey)
      || byName(a.who, b.who)
      || new Decimal(a.pct).comparedTo(b.pct),
  );
  const fixed: ResolvedGifts['fixed'] = [];
  for (const g of m.allocation.fixedGifts) {
    const who = r.get(g.personId);
    if (who) fixed.push({ who, amount: g.amount });
  }
  fixed.sort((a, b) => byName(a.who, b.who) || new Decimal(a.amount).comparedTo(b.amount));
  const residuary: ResolvedGifts['residuary'] = [];
  for (const g of m.allocation.residuary) {
    const who = r.get(g.personId);
    if (who) residuary.push({ who, pct: g.sharePct });
  }
  residuary.sort((a, b) => byName(a.who, b.who));
  const backups: ResolvedGifts['backups'] = [];
  for (const p of m.people) {
    const backup = r.get(p.contingentId);
    if (backup) backups.push({ who: p, backup });
  }
  backups.sort((a, b) => byName(a.who, b.who));
  return { specific, fixed, residuary, backups };
}

/** The full will. `standing` completes "I, NAME, born on ..., residing at ..., <standing>, make this ...". */
export function willDocumentBlocks(m: WillPayload, ctx: WillRenderContext, standing: string): WillBlock[] {
  const r = resolve(m);
  const gifts = resolveGifts(m);
  const d = m.details;
  const legalName = oneLine(d.legalName);
  const live = m.estate.items.filter((i) => i.review !== 'EXCLUDED');
  const assets = live.filter((i) => i.side === 'ASSET').sort(byKindThenLabel);
  const liabilities = live.filter((i) => i.side === 'LIABILITY').sort(byKindThenLabel);
  const blocks: WillBlock[] = [
    { t: 'title', text: 'Last Will and Testament' },
    { t: 'heading', text: `of ${legalName}` },
  ];
  let n = 0;
  const clause = (title: string, paras: string[]) => {
    blocks.push({ t: 'clause', n: ++n, title, paras });
  };

  clause('Declaration', [
    `I, ${legalName}, born on ${formatDateOnly(d.dob)}, residing at ${oneLine(d.address)}, ${standing}, make this my last Will and Testament on the date written below.`,
    'I revoke all Wills, codicils and other testamentary writings made by me before this Will.',
  ]);

  clause('Sound mind and free will', [
    'I make this Will of my own free will, while of sound mind and memory, and without any coercion, fraud or undue influence from anyone.',
  ]);

  const family = m.people
    .filter((p) => p.partyType === 'INDIVIDUAL' && !NOT_FAMILY.has(p.relationship))
    .sort(byName);
  clause('My family', [
    ...(d.maritalStatus ? [`I am ${MARITAL_WORDS[d.maritalStatus]}.`] : []),
    family.length
      ? `The members of my family named in this Will are: ${family.map(describePerson).join('; ')}.`
      : 'I have not named any member of my family in this Will.',
  ]);

  const ex = r.get(m.roles.executorId);
  const altEx = r.get(m.roles.altExecutorId);
  if (ex) {
    clause('Executor', [
      `I appoint ${describePersonInline(ex)} as the Executor of this Will.`,
      ...(altEx
        ? [`If ${personName(ex)} dies before me, or is unable or unwilling to act, I appoint ${describePersonInline(altEx)} as Executor in their place.`]
        : []),
      'My Executor may collect my assets, pay my debts and expenses, sell or transfer any asset where needed, and distribute my estate as this Will directs.',
    ]);
  }

  const guardian = r.get(m.roles.guardianId);
  const altGuardian = r.get(m.roles.altGuardianId);
  if (guardian && willMinorChildren(m, ctx.generatedOn).length > 0) {
    clause('Guardian of my minor children', [
      `If any of my children is under eighteen years of age at my death, I appoint ${describePersonInline(guardian)} as the guardian of the person and property of that child.`,
      ...(altGuardian
        ? [`If ${personName(guardian)} is unable or unwilling to act, I appoint ${describePersonInline(altGuardian)} as guardian in their place.`]
        : []),
    ]);
  }

  if (gifts.specific.length) {
    clause('Specific gifts', [
      'I give each asset listed below to the person named against it. Where a percentage is shown, that person receives that share of the asset.',
    ]);
    blocks.push({
      t: 'table',
      title: null,
      rows: gifts.specific.map((x) => [
        itemText(x.item),
        new Decimal(x.pct).equals(100) ? namePerson(x.who) : `${namePerson(x.who)} - ${pctText(x.pct)}`,
      ]),
    });
  }

  if (gifts.fixed.length) {
    clause('Gifts of money', [
      ...gifts.fixed.map((x) => `I give ${describePersonInline(x.who)} the sum of ${moneyText(x.amount)}.`),
      'These sums shall be paid out of my estate before the residue is divided.',
    ]);
  }

  clause('Residuary estate', [
    'I give all the rest and residue of my estate - including any asset not given above, any gift that fails, and anything I acquire after signing this Will - to the following persons in the shares shown:',
  ]);
  blocks.push({ t: 'table', title: null, rows: gifts.residuary.map((x) => [namePerson(x.who), pctText(x.pct)]) });

  clause('If a beneficiary dies before me', [
    'A person must survive me by thirty days to receive anything under this Will.',
    ...gifts.backups.map(
      (x) => `If ${personName(x.who)} does not survive me by thirty days, everything given to ${personName(x.who)} under this Will shall go to ${describePerson(x.backup)}.`,
    ),
    'Any other gift that fails shall fall into my residuary estate. If a share of my residuary estate fails, it shall be divided among the other residuary beneficiaries in proportion to their shares.',
  ]);

  clause('Debts and expenses', [
    'My Executor shall pay my debts, funeral and testamentary expenses, and any taxes due from my estate out of my residuary estate, before any gift in this Will is paid or transferred and before the residue is divided.',
    ...(liabilities.length ? ['My known liabilities are listed in the Schedule.'] : []),
  ]);

  const hasJoint = live.some((i) => i.ownership.type === 'JOINT');
  const hasNominee = live.some((i) => i.ownership.type === 'NOMINEE_ONLY');
  const hasHuf = live.some((i) => i.ownership.type === 'HUF');
  if (hasJoint || hasNominee || hasHuf) {
    clause('Joint assets and nominations', [
      ...(hasJoint ? ['Where I hold an asset jointly with another person, only my share of it passes under this Will.'] : []),
      ...(hasNominee
        ? ['A person registered as my nominee for any bank account, deposit, insurance policy, provident fund or investment shall hold what they receive for the persons entitled under this Will, except where the law makes the nominee its owner.']
        : []),
      ...(hasHuf
        ? ['My interest in any Hindu Undivided Family property passes under this Will only to the extent the law allows me to dispose of it.']
        : []),
    ]);
  }

  const wishes = m.instructions.text.split(/\r?\n/).map(oneLine).filter(Boolean);
  if (wishes.length) {
    clause('Additional wishes', [
      'The following are my wishes. They do not alter or revoke any gift made above in this Will, and if anything below conflicts with those gifts, the gifts above prevail.',
      ...wishes,
    ]);
  }

  if (assets.length || liabilities.length) {
    blocks.push({ t: 'heading', text: 'Schedule' });
    blocks.push({
      t: 'para',
      text: `Assets and liabilities known to me on ${formatDateOnly(m.estate.asOf ?? ctx.generatedOn)}. Values are estimates for identification only; this list does not limit my residuary estate.`,
    });
    if (assets.length) blocks.push({ t: 'table', title: 'Assets', rows: assets.map((i) => [itemText(i), scheduleValue(i)]) });
    if (liabilities.length) blocks.push({ t: 'table', title: 'Liabilities', rows: liabilities.map((i) => [itemText(i), inrFigure(i.value)]) });
  }

  blocks.push({ t: 'para', text: 'In witness whereof I have signed this Will on the date and at the place written below.' });
  blocks.push({
    t: 'signature',
    lines: [
      'Place: ____________________',
      'Date: ____________________',
      '',
      'Signature of the Testator: ____________________',
      `(${legalName})`,
    ],
  });
  blocks.push({
    t: 'witnesses',
    intro: 'Signed by the Testator as the last Will in our presence, both of us being present at the same time, and signed by us in the presence of the Testator and of each other. Neither of us is a beneficiary under this Will or the spouse of a beneficiary.',
    count: 2,
    fields: ['Signature', 'Full name', 'Address', 'Date'],
  });
  return blocks;
}
