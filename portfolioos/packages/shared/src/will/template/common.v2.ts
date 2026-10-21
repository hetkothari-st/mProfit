/**
 * Will template v2 - the redesigned document (docs/will/WILL-V2-REDESIGN.md).
 *
 * LOCKED (LOCK.json, checked by packages/api/test/will/templateLock.test.ts):
 * these words are what people sign. To change them, add common.v3.ts. Never
 * edit this file once a v2 will exists.
 * Release gate: the text is reviewed by a qualified Indian advocate before launch.
 *
 * What changed from v1: an opening recital instead of a "Declaration" clause,
 * revocation and capacity as their own sections, numbered sub-clauses, every
 * gift as its own sentence tied to a numbered Schedule item, a configurable
 * survivorship period, an explicit fallback when a back-up beneficiary and the
 * whole residue fail, a general clause on how to read the Schedule, a columned
 * Schedule grouped by category, and one execution block.
 */
import { Decimal } from '../../decimal.js';
import { formatDateOnly } from '../../format/date.js';
import type { WillBlockV2, WillScheduleColumn } from '../astV2.js';
import {
  WILL_ESTATE_KINDS,
  type MaritalStatus, type WillAssetItem, type WillEstateKind, type WillParentageRelation, type WillPayload,
  type WillPerson, type WillRelationship,
} from '../schema.js';
import { willMinorChildren } from '../estateMath.js';
import {
  cmpText, describePerson, inrFigure, moneyText, oneLine, pctText, personName, resolveGifts,
  byName, type WillRenderContext,
} from './common.v1.js';

const NOT_FAMILY: ReadonlySet<WillRelationship> = new Set<WillRelationship>(['FRIEND', 'CHARITY', 'OTHER']);

const MARITAL_WORDS: Record<MaritalStatus, string> = {
  SINGLE: 'unmarried',
  MARRIED: 'married',
  WIDOWED: 'widowed',
  DIVORCED: 'divorced',
  SEPARATED: 'separated from my spouse',
};

const PARENTAGE_WORDS: Record<WillParentageRelation, string> = {
  SON_OF: 'son of',
  DAUGHTER_OF: 'daughter of',
  WIFE_OF: 'wife of',
  HUSBAND_OF: 'husband of',
  CHILD_OF: 'child of',
  SPOUSE_OF: 'spouse of',
};

/** Schedule categories, in print order. Every estate kind belongs to exactly one. */
const ASSET_GROUPS: ReadonlyArray<{ title: string; kinds: readonly WillEstateKind[] }> = [
  { title: 'Immovable property', kinds: ['OWNED_PROPERTY', 'RENTAL_PROPERTY'] },
  { title: 'Bank accounts and deposits', kinds: ['BANK_ACCOUNT'] },
  { title: 'Shares, mutual funds and other investments', kinds: ['HOLDING'] },
  { title: 'Provident fund and retirement accounts', kinds: ['PROVIDENT_FUND'] },
  { title: 'Insurance policies', kinds: ['INSURANCE'] },
  { title: 'Vehicles', kinds: ['VEHICLE'] },
  { title: 'Amounts owed to me', kinds: ['LOAN_GIVEN'] },
  { title: 'Other assets', kinds: ['OTHER_ASSET'] },
];
const LIABILITY_GROUPS: ReadonlyArray<{ title: string; kinds: readonly WillEstateKind[] }> = [
  { title: 'Loans', kinds: ['LOAN'] },
  { title: 'Credit cards', kinds: ['CREDIT_CARD'] },
  { title: 'Other liabilities', kinds: ['OTHER_LIABILITY'] },
];

const ASSET_COLUMNS: WillScheduleColumn[] = [
  { label: 'No.', width: 0.06, align: 'left' },
  { label: 'Description', width: 0.29, align: 'left' },
  { label: 'Identifier', width: 0.16, align: 'left' },
  { label: 'Holding', width: 0.14, align: 'left' },
  { label: 'Passes under', width: 0.19, align: 'left' },
  { label: 'Estimated value', width: 0.16, align: 'right' },
];
const LIABILITY_COLUMNS: WillScheduleColumn[] = [
  { label: 'No.', width: 0.07, align: 'left' },
  { label: 'Description', width: 0.5, align: 'left' },
  { label: 'Identifier', width: 0.2, align: 'left' },
  { label: 'Outstanding', width: 0.23, align: 'right' },
];

function byKindThenLabel(a: WillAssetItem, b: WillAssetItem): number {
  return WILL_ESTATE_KINDS.indexOf(a.kind) - WILL_ESTATE_KINDS.indexOf(b.kind)
    || cmpText(oneLine(a.label), oneLine(b.label))
    || cmpText(a.sourceKey, b.sourceKey);
}

/** describePerson inside a sentence: "my son Arjun Verma, born on 10/02/1998, as ..." closes the aside. */
function describeInline(p: WillPerson): string {
  const s = describePerson(p);
  return p.partyType !== 'ORGANISATION' && p.dob ? `${s},` : s;
}

/** A schedule value: an unvalued item is stored as 0, which must not read as "worth nothing". */
function valueText(i: WillAssetItem): string {
  return new Decimal(i.value).isZero() ? 'Not valued' : inrFigure(i.value);
}

function holdingText(i: WillAssetItem): string {
  switch (i.ownership.type) {
    case 'SOLE':
      return 'Sole';
    case 'JOINT':
      return `Joint - my share ${pctText(i.ownership.sharePct)}`;
    case 'HUF':
      return `HUF - my share ${pctText(i.ownership.sharePct)}`;
    case 'NOMINEE_ONLY':
      return 'Payable to nominee';
  }
}

function scheduleDescription(i: WillAssetItem): string {
  const label = oneLine(i.label);
  return i.kind === 'INSURANCE' ? `${label} (value shown is the sum assured)` : label;
}

/** "the" / "my share in the" before an item, so a gift of a joint asset never claims the whole. */
function itemPhrase(i: WillAssetItem, no: string): string {
  const share = i.ownership.type === 'JOINT' || i.ownership.type === 'HUF' ? 'all my share and interest in ' : '';
  const ref = i.ref ? `, ${oneLine(i.ref)}` : '';
  return `${share}${oneLine(i.label)}${ref} (Schedule item ${no})`;
}

/** Ordinal number words up to twenty for the survivorship period; numerals are printed beside them. */
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function daysText(n: number): string {
  const words = n <= 20 ? NUMBER_WORDS[n]! : `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${NUMBER_WORDS[n % 10]}` : ''}`;
  return `${words} (${n}) days`;
}

/** The full will. `standing` completes "I, NAME, ..., residing at ..., <standing>, make this ...". */
export function willDocumentBlocksV2(m: WillPayload, ctx: WillRenderContext, standing: string): WillBlockV2[] {
  const people = new Map(m.people.map((p) => [p.id, p]));
  const get = (id: string | null) => (id ? people.get(id) ?? null : null);
  const gifts = resolveGifts(m);
  const d = m.details;
  const legalName = oneLine(d.legalName);
  const live = m.estate.items.filter((i) => i.review !== 'EXCLUDED');

  // Number the schedule first: the gift clauses refer to these numbers.
  const assetGroups = ASSET_GROUPS
    .map((g) => ({ title: g.title, items: live.filter((i) => i.side === 'ASSET' && g.kinds.includes(i.kind)).sort(byKindThenLabel) }))
    .filter((g) => g.items.length > 0);
  const liabilityGroups = LIABILITY_GROUPS
    .map((g) => ({ title: g.title, items: live.filter((i) => i.side === 'LIABILITY' && g.kinds.includes(i.kind)).sort(byKindThenLabel) }))
    .filter((g) => g.items.length > 0);
  const itemNo = new Map<string, string>();
  let a = 0;
  for (const g of assetGroups) for (const i of g.items) itemNo.set(i.sourceKey, `A${++a}`);
  let l = 0;
  for (const g of liabilityGroups) for (const i of g.items) itemNo.set(i.sourceKey, `L${++l}`);
  const hasLiabilities = l > 0;

  const blocks: WillBlockV2[] = [
    { t: 'title', text: 'Last Will and Testament' },
    { t: 'heading', text: `of ${legalName}` },
  ];
  const parentageName = oneLine(d.parentage.name);
  const parentage = d.parentage.relation && parentageName ? `, ${PARENTAGE_WORDS[d.parentage.relation]} ${parentageName}` : '';
  blocks.push({
    t: 'para',
    text: `I, ${legalName}${parentage}, born on ${formatDateOnly(d.dob)}, residing at ${oneLine(d.address)}, ${standing}, make this my last Will and Testament on the date written at its end.`,
  });

  let n = 0;
  const section = (title: string, paras: string[]): number => {
    const no = ++n;
    blocks.push({ t: 'section', n: no, title, paras: paras.map((text, i) => ({ n: paras.length > 1 ? `${no}.${i + 1}` : '', text })) });
    return no;
  };
  /** Sub-clause number of paragraph `i` (0-based) of the section that will be numbered next. */
  const subNo = (i: number) => `${n + 1}.${i + 1}`;

  section('Revocation', ['I revoke all Wills, codicils and other testamentary dispositions made by me before this Will.']);

  section('Capacity and free will', [
    'I am of sound mind and memory and I am not a minor. I make this Will of my own free will, without any coercion, fraud or undue influence from any person, and I understand its contents and effect.',
  ]);

  const family = m.people
    .filter((p) => p.partyType === 'INDIVIDUAL' && !NOT_FAMILY.has(p.relationship))
    .sort(byName);
  section('My family', [
    ...(d.maritalStatus ? [`I am ${MARITAL_WORDS[d.maritalStatus]}.`] : []),
    family.length
      ? `The members of my family named in this Will are: ${family.map(describePerson).join('; ')}.`
      : 'I have not named any member of my family in this Will.',
  ]);

  const ex = get(m.roles.executorId);
  const altEx = get(m.roles.altExecutorId);
  if (ex) {
    section('Executor', [
      `I appoint ${describeInline(ex)} as the Executor of this Will.`,
      ...(altEx
        ? [`If ${personName(ex)} dies before me, or is unable or unwilling to act or to continue acting, I appoint ${describeInline(altEx)} as Executor in their place.`]
        : []),
      'Subject to the law, my Executor may take possession of and collect my assets, pay my debts and the expenses of administering my estate, sell or transfer any asset where that is needed to carry out this Will, apply for probate or other representation where the law requires it, and distribute my estate as this Will directs.',
    ]);
  }

  const guardian = get(m.roles.guardianId);
  const altGuardian = get(m.roles.altGuardianId);
  if (guardian && willMinorChildren(m, ctx.generatedOn).length > 0) {
    section('Guardian of my minor children', [
      `If any child of mine is a minor at my death, I appoint ${describeInline(guardian)} as the guardian of the person and property of that child, to the extent the law allows me to make this appointment.`,
      ...(altGuardian
        ? [`If ${personName(guardian)} is unable or unwilling to act, I appoint ${describeInline(altGuardian)} as guardian in their place.`]
        : []),
    ]);
  }

  // Clause references per schedule item, filled as the gift clauses are numbered.
  const passesUnder = new Map<string, string[]>();
  if (gifts.specific.length) {
    const paras = ['I make the following gifts of specific assets. Each asset is described in the Schedule under the item number shown.'];
    // In Schedule order, so the clause numbers and the item numbers run the same way.
    const order = new Map([...itemNo.keys()].map((k, idx) => [k, idx]));
    const specific = [...gifts.specific].sort(
      (x, y) => (order.get(x.item.sourceKey) ?? 0) - (order.get(y.item.sourceKey) ?? 0) || byName(x.who, y.who),
    );
    for (const x of specific) {
      const no = itemNo.get(x.item.sourceKey) ?? '-';
      const whole = new Decimal(x.pct).equals(100);
      const ref = subNo(paras.length);
      paras.push(`I give ${whole ? '' : `a ${pctText(x.pct)} share of `}${itemPhrase(x.item, no)} to ${describePerson(x.who)}.`);
      const refs = passesUnder.get(x.item.sourceKey) ?? [];
      refs.push(`Clause ${ref} - ${personName(x.who)}${whole ? '' : ` (${pctText(x.pct)})`}`);
      passesUnder.set(x.item.sourceKey, refs);
    }
    section('Specific gifts', paras);
  }

  if (gifts.fixed.length) {
    section('Gifts of money', [
      ...gifts.fixed.map((x) => `I give ${describeInline(x.who)} the sum of ${moneyText(x.amount)}.`),
      'These sums shall be paid out of my estate before my residuary estate is divided.',
    ]);
  }

  const residuaryNo = section('Residuary estate', [
    'I give all the rest and residue of my estate - including any asset not effectively given by the clauses above, any gift that fails, and any property I acquire after making this Will - to the following persons in the shares shown.',
    ...gifts.residuary.map((x) => `To ${describePerson(x.who)}: a ${pctText(x.pct)} share.`),
  ]);

  const days = m.allocation.survivalDays;
  const survival = subNo(0);
  section('Survivorship and failed gifts', [
    days > 0
      ? `A person must survive me by ${daysText(days)} to receive any gift under this Will. A person who does not is treated as having died before me.`
      : 'A person must survive me to receive any gift under this Will.',
    ...gifts.backups.map(
      (x) => `If ${personName(x.who)} does not receive a gift because of clause ${survival}, every gift to ${personName(x.who)} under this Will shall go instead to ${describePerson(x.backup)}, who must also meet clause ${survival}.`,
    ),
    'Any gift that fails for any reason, and is not given to someone else by this clause, falls into my residuary estate. If a share of my residuary estate fails, it shall be added to the shares of the other residuary beneficiaries in proportion to their shares.',
    'If the whole of my residuary estate fails, it shall pass to my legal heirs under the law of succession that applies to me.',
  ]);

  section('Debts and expenses', [
    `My Executor shall pay my debts, my funeral and testamentary expenses, and any taxes payable by my estate out of my residuary estate, before any gift in this Will is paid or transferred and before my residuary estate is divided.${hasLiabilities ? ' My liabilities known to me are listed in Part B of the Schedule.' : ''}`,
  ]);

  const hasJoint = live.some((i) => i.ownership.type === 'JOINT');
  const hasNominee = live.some((i) => i.ownership.type === 'NOMINEE_ONLY');
  const hasHuf = live.some((i) => i.ownership.type === 'HUF');
  let jointNo = 0;
  if (hasJoint || hasNominee || hasHuf) {
    jointNo = section('Joint assets and nominations', [
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
    section('Additional wishes', [
      'The following are my wishes. They do not alter or revoke any gift made in this Will, and if anything below conflicts with a gift, the gift prevails.',
      ...wishes,
    ]);
  }

  const hasSchedule = assetGroups.length > 0 || hasLiabilities;
  section('Interpretation', [
    'The headings in this Will are for convenience only and do not affect its meaning.',
    ...(hasSchedule
      ? ['The Schedule identifies assets and liabilities known to me when this Will was prepared. Its values are estimates. The Schedule does not decide by itself what forms part of my estate, and it does not limit or enlarge any gift made in this Will.']
      : []),
  ]);

  if (hasSchedule) {
    const asOf = formatDateOnly(m.estate.asOf ?? ctx.generatedOn);
    blocks.push({ t: 'heading', text: 'Schedule' });
    blocks.push({
      t: 'note',
      text: `Assets and liabilities known to me on ${asOf}. Amounts are in Indian rupees and are estimates for identification only. Account and policy numbers are partly masked. "Passes under" shows the clause of this Will that disposes of the item.`,
    });
    if (assetGroups.length) {
      blocks.push({
        t: 'schedule',
        title: 'Part A - Assets',
        intro: null,
        columns: ASSET_COLUMNS,
        groups: assetGroups.map((g) => ({
          title: g.title,
          rows: g.items.map((i) => [
            itemNo.get(i.sourceKey)!,
            scheduleDescription(i),
            i.ref ? oneLine(i.ref) : '-',
            holdingText(i),
            i.ownership.type === 'NOMINEE_ONLY'
              ? `Nomination (clause ${jointNo})`
              : (passesUnder.get(i.sourceKey)?.join('; ') ?? `Residue (clause ${residuaryNo})`),
            valueText(i),
          ]),
        })),
      });
    }
    if (hasLiabilities) {
      blocks.push({
        t: 'schedule',
        title: 'Part B - Liabilities',
        intro: null,
        columns: LIABILITY_COLUMNS,
        groups: liabilityGroups.map((g) => ({
          title: g.title,
          rows: g.items.map((i) => [itemNo.get(i.sourceKey)!, oneLine(i.label), i.ref ? oneLine(i.ref) : '-', valueText(i)]),
        })),
      });
    }
  }

  blocks.push({
    t: 'execution',
    testimonium: `IN WITNESS WHEREOF I, ${legalName}, have signed this Will at the place and on the date written below.`,
    fields: ['Place', 'Date'],
    testator: legalName,
    attestation: `Signed by the above-named Testator, ${legalName}, as the Testator's last Will, in our presence, both of us being present at the same time; and we, at the request and in the presence of the Testator and in the presence of each other, have signed below as attesting witnesses. Neither of us is a beneficiary under this Will or the spouse of a beneficiary.`,
    witnessCount: 2,
    witnessFields: ['Signature', 'Full name', 'Age and occupation', 'Address', 'Date'],
  });
  return blocks;
}
