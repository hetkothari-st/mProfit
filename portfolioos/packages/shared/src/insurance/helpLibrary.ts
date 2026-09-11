/**
 * Help and rights library: the insurance rules that matter to a policyholder,
 * in plain words, with what to do about them.
 *
 * Every rule, limit or deadline stated here sits beside the official source
 * and the place in it (checked on SOURCES_CHECKED_ON). Rights already written
 * up for the claims assistant are quoted from `claimsGuide` rather than
 * restated, and grace days come from `premiumSchedule`, so the library, the
 * claims tracker and the reminders can't drift apart. `body` paragraphs
 * explain; they don't state rules — the `rules` do.
 *
 * Used by the /insurance/help page and by the assistant, which may only state
 * a rule it finds here, with its source.
 */
import {
  CLAIM_GUIDES,
  ESCALATION,
  SOURCES_CHECKED_ON,
  type ClaimRight,
  type OfficialSource,
} from './claimsGuide.js';
import { defaultGraceDays } from './premiumSchedule.js';

export type HelpGroupId = 'BUYING' | 'OWNING' | 'CLAIMING' | 'GOING_WRONG';

export interface HelpGroup {
  id: HelpGroupId;
  title: string;
  blurb: string;
}

export const HELP_GROUPS: readonly HelpGroup[] = [
  { id: 'BUYING', title: 'Buying', blurb: 'Before and just after you take a policy.' },
  { id: 'OWNING', title: 'Owning', blurb: 'Keeping a policy going, and changing it.' },
  { id: 'CLAIMING', title: 'Claiming', blurb: 'What the insurer owes you when you claim.' },
  { id: 'GOING_WRONG', title: 'When things go wrong', blurb: 'Complaints, mis-selling and lost money.' },
];

/** A rule as the library states it: a paraphrase and where it comes from. */
export type HelpRule = ClaimRight;

export interface HelpTopic {
  /** Stable, anchor-safe: /insurance/help#<id>. */
  id: string;
  group: HelpGroupId;
  title: string;
  /** One line. */
  summary: string;
  /** Short plain-language paragraphs. Explanation only — rules go in `rules`. */
  body: string[];
  /** What the rules say, each with its source. */
  rules: HelpRule[];
  whatYouCanDo: string[];
  /** Every source the topic relies on, once each. */
  sources: OfficialSource[];
  /** For search and for the assistant. Lower case. */
  keywords: string[];
  related?: string[];
  checkedOn: string;
}

// ── Sources ──────────────────────────────────────────────────────────

const PPI_2024 = (where: string): OfficialSource => ({
  label: "IRDAI Master Circular on Protection of Policyholders' Interests, 2024",
  url: 'https://irdai.gov.in/document-detail?documentId=5625747',
  where,
});

const HEALTH_MC_2024 = (where: string): OfficialSource => ({
  label: 'IRDAI Master Circular on Health Insurance Business, 29 May 2024',
  url:
    'https://irdai.gov.in/documents/37343/365525/%E0%A4%B8%E0%A5%8D%E0%A4%B5%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%A5%E0%A5%8D%E0%A4%AF+%E0%A4%AC%E0%A5%80%E0%A4%AE%E0%A4%BE+%E0%A4%B5%E0%A5%8D%E0%A4%AF%E0%A4%B5%E0%A4%B8%E0%A4%BE%E0%A4%AF+%E0%A4%AA%E0%A4%B0+%E0%A4%AE%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%9F%E0%A4%B0+%E0%A4%AA%E0%A4%B0%E0%A4%BF%E0%A4%AA%E0%A4%A4%E0%A5%8D%E0%A4%B0+_+Master+Circular++on+Health++Insurance+Business++29052024.pdf/5e707a91-b5de-1ec1-cf18-b66273a6839d?version=1.0&t=1716962621002',
  where,
});

const BIMA_BHAROSA_UNCLAIMED: OfficialSource = {
  label: 'IRDAI Bima Bharosa — unclaimed amounts, with links to every insurer',
  url: 'https://bimabharosa.irdai.gov.in/Home/UnclaimedAmount',
};

const rule = (text: string, source: OfficialSource): HelpRule => ({ text, source });

// ── Reused figures ───────────────────────────────────────────────────

const GRACE_MONTHLY = defaultGraceDays('TERM', 'MONTHLY');
const GRACE_OTHER = defaultGraceDays('TERM', 'ANNUAL');

const FREE_LOOK_LIFE = rule(
  'Life policies with a term of one year or more: you have 30 days from receiving the policy to return it for cancellation — for any reason, and the insurer must accept.',
  PPI_2024('page 12'),
);

const LATE_PAYMENT_INTEREST_LIFE = rule(
  'If a life claim, surrender or withdrawal is paid late, you’re owed interest at 2% above the bank rate from the day the insurer received it, paid without your asking.',
  PPI_2024('page 15'),
);

// ── Topics ───────────────────────────────────────────────────────────

type TopicInput = Omit<HelpTopic, 'sources' | 'checkedOn'> & { extraSources?: OfficialSource[] };

function uniqueSources(list: OfficialSource[]): OfficialSource[] {
  const seen = new Set<string>();
  const out: OfficialSource[] = [];
  for (const s of list) {
    const key = `${s.url}|${s.where ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function topic({ extraSources = [], ...t }: TopicInput): HelpTopic {
  return {
    ...t,
    sources: uniqueSources([...t.rules.map((r) => r.source), ...extraSources]),
    checkedOn: SOURCES_CHECKED_ON,
  };
}

export const HELP_TOPICS: readonly HelpTopic[] = [
  // ── Buying ─────────────────────────────────────────────────────────
  topic({
    id: 'free-look-period',
    group: 'BUYING',
    title: 'Free-look period: changing your mind',
    summary: 'You get 30 days after receiving a life or health policy to return it and get your premium back, less a few costs.',
    body: [
      'The free-look period is a cooling-off window. If a new policy isn’t what you expected — or isn’t what you were told — you can cancel it without giving a reason.',
      'The 30 days start when you receive the policy document, not when you paid.',
    ],
    rules: [
      FREE_LOOK_LIFE,
      rule(
        'The refund is the premium you paid, less only a proportionate risk premium for the days you were covered, and any costs of your medical examination and stamp duty.',
        PPI_2024('page 12'),
      ),
      rule(
        'For a unit-linked (ULIP) policy, the refund is made by buying back the units at their NAV on the day of cancellation, after the same deductions.',
        PPI_2024('page 12'),
      ),
      rule(
        'The life insurer must refund within 7 days of your request. If it’s late, it must add interest at 2% above the bank rate, without being asked.',
        PPI_2024('pages 12–13'),
      ),
      rule(
        'Health policies with a term of one year or more also have a 30-day free-look period from receiving the policy document, with the same deductions.',
        PPI_2024('page 27'),
      ),
    ],
    whatYouCanDo: [
      'Read the policy and its Customer Information Sheet as soon as they arrive.',
      'If you want out, write to the insurer before the 30 days are up — by email or on its website — and keep the acknowledgement.',
      'Note the date you asked. If a life policy refund hasn’t arrived within 7 days, ask for the interest too.',
    ],
    keywords: ['free look', 'free-look', 'cooling off', 'cancel policy', 'cancel', 'return policy', 'refund', 'changed my mind', 'new policy', '30 days'],
    related: ['customer-information-sheet', 'mis-selling'],
  }),

  topic({
    id: 'customer-information-sheet',
    group: 'BUYING',
    title: 'Customer Information Sheet, and documents in your language',
    summary: 'Every policy comes with a short sheet explaining it in simple words — and you can ask for it in a regional language.',
    body: [
      'The Customer Information Sheet (CIS) sums up your policy in one place: what’s covered, what isn’t, and the limits and waiting periods that decide what a claim pays. It’s the quickest way to check the policy matches what you were sold.',
      'The full policy document still has the final word.',
    ],
    rules: [
      rule(
        'Within 15 days of accepting your proposal, a life insurer must send, free of charge, the policy document, a copy of your proposal form, the benefit illustration and the Customer Information Sheet.',
        PPI_2024('page 11'),
      ),
      rule(
        'The CIS sets out the type of insurance, the sum assured, the benefits, a summary of exclusions and key terms such as the free-look period — and how to claim, how to complain, and your Insurance Ombudsman’s contact details.',
        PPI_2024('pages 11–12'),
      ),
      rule(
        'For health policies, the CIS must also show sub-limits, deductibles, co-payment and waiting periods, and cover the free-look period, renewal, migration, portability and the moratorium period.',
        PPI_2024('pages 26–27'),
      ),
      rule('The CIS must be made available in a regional language if you want it.', PPI_2024('page 56')),
      rule(
        'Proposal forms are in Hindi or English, and in a regional language if you ask. If you’re not familiar with the form’s language, the insurer or agent must explain it to you.',
        PPI_2024('pages 8–9'),
      ),
      rule(
        'If the coverage doesn’t match what you expected, you can take it up with the insurer, or with the agent who sold it, to have it corrected.',
        PPI_2024('page 12'),
      ),
    ],
    whatYouCanDo: [
      'Find the CIS in your policy pack — it comes with the policy document.',
      'Check the exclusions, sub-limits and waiting periods against what you were told.',
      'Want it in your language? Ask the insurer in writing.',
      'Spot a mismatch? Raise it with the insurer straight away — while you can still use the free-look period.',
    ],
    keywords: ['customer information sheet', 'cis', 'key features', 'regional language', 'hindi', 'language', 'exclusions', 'sub-limit', 'waiting period', 'benefit illustration', 'policy document', 'proposal form'],
    related: ['free-look-period'],
  }),

  topic({
    id: 'health-portability',
    group: 'BUYING',
    title: 'Moving your health cover: portability and migration',
    summary: 'Move your health policy to another insurer, or another plan with the same insurer, and keep the waiting periods you’ve served.',
    body: [
      'Waiting periods for pre-existing diseases can run for years, so a brand-new policy can mean serving them again. Portability lets you switch insurer at renewal and carry that time across; migration does the same between plans at one insurer.',
      'The new insurer still decides whether to accept you, so keep the old policy going until the new one is confirmed.',
    ],
    rules: [
      rule('Individual, family floater and group health policies can be ported to another insurer at renewal.', PPI_2024('page 58')),
      rule(
        'Apply to the new insurer at least 30 days, but not more than 60 days, before your renewal date — porting the whole policy, with every family member on it.',
        PPI_2024('page 58'),
      ),
      rule(
        'Your current insurer must share your policy and claim details within 72 hours of being asked, and the new insurer must decide within 5 days of getting them.',
        PPI_2024('page 59'),
      ),
      rule(
        'You carry across your credits: sum insured, no-claim bonus, specific waiting periods, the waiting period for pre-existing diseases, and the moratorium period.',
        PPI_2024('page 59'),
      ),
      rule('No charges can be levied on you for porting in or out.', PPI_2024('page 59')),
      rule('Moving to another plan with the same insurer (migration) carries the same credits across.', PPI_2024('page 29')),
    ],
    whatYouCanDo: [
      'Note your renewal date and start about 60 days ahead.',
      'Ask the new insurer for its portability form and proposal form, and answer the health questions fully.',
      'If the new policy isn’t confirmed in time, renew the old one — within the grace period if need be.',
      'When the new policy arrives, check it shows your waiting-period credits.',
    ],
    keywords: ['portability', 'port', 'switch insurer', 'change insurer', 'move health policy', 'another insurer', 'migration', 'migrate', 'waiting period', 'pre-existing', 'credits', 'no claim bonus'],
    related: ['health-renewal', 'moratorium'],
  }),

  // ── Owning ─────────────────────────────────────────────────────────
  topic({
    id: 'grace-period',
    group: 'OWNING',
    title: 'Grace period for a missed premium',
    summary: `Missed a life or health premium? You have ${GRACE_OTHER} days to pay — ${GRACE_MONTHLY} if you pay monthly.`,
    body: [
      'A grace period is extra time to pay a premium after its due date. It doesn’t apply to single-premium policies.',
      'Your policy document gives the exact terms, and EveryPaisa counts the days down on each policy you record. For other kinds of cover, such as motor, check your policy and renew before it expires.',
    ],
    rules: [
      rule(
        `Life policies: ${GRACE_MONTHLY} days where premiums are paid monthly, and ${GRACE_OTHER} days for quarterly, half-yearly or yearly premiums — with no penalty or late fee.`,
        PPI_2024('page 13'),
      ),
      rule('During the grace period a life policy stays in force, and the cover continues without a break.', PPI_2024('page 14')),
      rule('If a life premium isn’t paid within the grace period, the policy lapses.', PPI_2024('page 13')),
      rule(
        `Health policies: the same ${GRACE_MONTHLY} and ${GRACE_OTHER} days. If you pay the premium in instalments, you’re covered through the grace period too; otherwise, cover during the grace period depends on your policy’s terms.`,
        PPI_2024('page 28'),
      ),
      rule(
        'Renew a health policy within the grace period and every credit is protected — sum insured, no-claim bonus, waiting periods and the moratorium period.',
        PPI_2024('page 28'),
      ),
    ],
    whatYouCanDo: [
      'Record your premiums in EveryPaisa so it reminds you before the due date and while you’re in grace.',
      'Pay the insurer directly — its website, app or branch — and keep the receipt.',
      'Missed the grace period on a life policy? See “Reviving a lapsed life policy”.',
    ],
    keywords: ['grace period', 'grace', 'missed premium', 'late premium', 'forgot to pay', 'premium due', 'overdue premium', 'late fee', 'premium'],
    related: ['lapse-and-revival', 'health-renewal'],
  }),

  topic({
    id: 'nomination',
    group: 'OWNING',
    title: 'Nominees: naming and changing them',
    summary: 'Name who receives the money if you die — and change it whenever your life changes.',
    body: [
      'A nominee is the person the insurer pays if the policyholder dies. Naming one makes the claim straightforward for your family.',
      'You can name more than one person and split the payout between them. If a nominee is a child, you can name an adult to receive the money for them.',
    ],
    rules: [
      rule(
        'You can nominate one or more people and set the percentage of the claim each receives.',
        PPI_2024('page 10'),
      ),
      rule(
        'If a nominee is a minor, you can appoint someone to receive the money on their behalf if you die while they’re still a minor.',
        PPI_2024('page 10'),
      ),
      rule('You can change the nomination at any time during the policy term — life and health policies alike.', PPI_2024('pages 10, 25')),
      rule(
        'When you ask to change a nominee (or your address or contact details), the insurer must acknowledge it at once and make the change within 7 days. If it doesn’t, you can raise a grievance.',
        PPI_2024('page 14'),
      ),
      rule('The proposal form asks for your nominee’s contact and bank details.', PPI_2024('page 9')),
    ],
    whatYouCanDo: [
      'Check every policy in EveryPaisa has a nominee — the assistant can list the ones that don’t.',
      'After a marriage, birth, divorce or death in the family, update your nominees with each insurer.',
      'Tell your nominees which policies name them and where the documents are.',
      'Keep the insurer’s acknowledgement of each change.',
    ],
    keywords: ['nominee', 'nomination', 'change nominee', 'add nominee', 'beneficiary', 'appointee', 'minor nominee', 'who gets the money', 'legal heir'],
    related: ['assignment', 'unclaimed-amounts'],
  }),

  topic({
    id: 'assignment',
    group: 'OWNING',
    title: 'Policy assigned to a lender',
    summary: 'If a life policy backs a loan, the lender is paid what’s owed first and the rest goes to your nominee.',
    body: [
      'Assignment transfers the rights under a policy to someone else — most often a bank, as security for a loan. It isn’t the same as nomination: a nominee receives the money, an assignee holds the rights.',
      'When the loan is repaid, ask the lender to release the policy and get the insurer to confirm it in writing.',
    ],
    rules: [
      rule(
        'If the policyholder dies and the policy is assigned, the nominee should check the assignment to the lender is valid, confirm the loan balance, and consent to the insurer paying the lender only the outstanding dues — with any balance paid straight to the nominee’s bank account.',
        PPI_2024('page 16'),
      ),
      rule(
        'Under a group policy assigned to a lender, the lender can be paid only the loan outstanding on the date of the event, and the rest must go to the member or nominee directly. You must be told about the assignment in advance and consent to the amount.',
        PPI_2024('pages 17–18'),
      ),
    ],
    whatYouCanDo: [
      'Keep a copy of any assignment with the policy.',
      'Once the loan is closed, get the assignment released and the insurer’s confirmation in writing.',
      'Make sure your nominee knows about the loan — they’ll be asked to confirm the balance.',
    ],
    keywords: ['assignment', 'assign', 'assigned', 'loan against policy', 'home loan', 'lender', 'collateral', 'security', 'reassign'],
    related: ['nomination', 'surrender-and-withdrawal'],
  }),

  topic({
    id: 'lapse-and-revival',
    group: 'OWNING',
    title: 'Reviving a lapsed life policy',
    summary: 'A lapsed policy can be brought back within the revival period, by paying the missed premiums with interest.',
    body: [
      'A lapsed policy stops protecting your family, and a new policy later is priced for your age and health then. Reviving keeps the original policy going.',
      'Your policy document says how long you have to revive, and on what terms.',
    ],
    rules: [
      rule(
        'If a premium isn’t paid within the grace period, the policy lapses, and you can no longer use its benefits or cover.',
        PPI_2024('page 13'),
      ),
      rule(
        'A lapsed policy can be revived within the period set in the policy document. You pay the unpaid premiums with interest or a late fee, and may need to give a health declaration or have a medical.',
        PPI_2024('page 13'),
      ),
      rule('A life policy’s Customer Information Sheet must set out your options, including revival and policy loans.', PPI_2024('page 12')),
      rule(
        'The three years after which a life policy can no longer be questioned run from the latest of the policy date, the start of cover, the revival date or a rider’s date — so a revival restarts that clock.',
        PPI_2024('page 14'),
      ),
    ],
    whatYouCanDo: [
      'Find the revival period in your policy document or Customer Information Sheet.',
      'Ask the insurer for the revival amount — premiums due plus interest — and whether it needs a medical.',
      'Answer health questions fully: a revived policy can be questioned for three years from the revival.',
      'Once revived, record the payments in EveryPaisa so reminders pick up again.',
    ],
    keywords: ['lapse', 'lapsed', 'revive', 'revival', 'reinstate', 'restart policy', 'missed premiums', 'policy stopped'],
    related: ['grace-period', 'moratorium'],
  }),

  topic({
    id: 'surrender-and-withdrawal',
    group: 'OWNING',
    title: 'Surrender, partial withdrawal and policy loans',
    summary: 'Cashing in a life policy early usually costs you — but if you do, the insurer has 7 days to pay.',
    body: [
      'Surrendering means ending a policy early in exchange for its surrender value. The rules themselves advise keeping a life policy in force if you can.',
      'If you need cash, a policy loan or a partial withdrawal may let you keep the cover.',
    ],
    rules: [
      CLAIM_GUIDES.LIFE_MATURITY.rights[1]!,
      LATE_PAYMENT_INTEREST_LIFE,
      rule('Surrendering a life policy involves a surrender penalty, and ends the policy.', PPI_2024('page 16')),
      rule(
        'Non-linked savings policies — other than pure protection and immediate annuity policies — acquire a surrender value. Surrender in the first year and the higher of the guaranteed (GSV) or special (SSV) surrender value becomes payable once the first policy year is complete, provided a full year’s premium has been paid.',
        PPI_2024('page 16'),
      ),
      rule('For a ULIP, you get the fund value less the surrender charge, subject to the five-year lock-in.', PPI_2024('page 16')),
      rule(
        'A ULIP allows no withdrawals in its first five years; after that, partial withdrawals are allowed on the policy’s terms.',
        PPI_2024('page 14'),
      ),
      rule(
        'Except for pure protection and unit-linked policies, you can take a repayable loan against a life policy on its terms.',
        PPI_2024('page 14'),
      ),
    ],
    whatYouCanDo: [
      'Ask the insurer for the surrender value in writing before you decide.',
      'Compare it with a policy loan or a partial withdrawal, which keep the cover going.',
      'If you surrender, note the date you asked — payment is due within 7 days.',
      'If your family depends on the cover, arrange new cover before you surrender.',
    ],
    keywords: ['surrender', 'surrender value', 'cash in', 'close policy', 'exit policy', 'partial withdrawal', 'withdrawal', 'withdraw', 'lock-in', 'policy loan', 'loan against policy', 'gsv', 'ssv', 'ulip'],
    related: ['assignment', 'lapse-and-revival'],
  }),

  topic({
    id: 'health-renewal',
    group: 'OWNING',
    title: 'Renewing health insurance',
    summary: 'Your insurer can’t refuse to renew your health policy because you made claims.',
    body: [
      'Health cover builds value over time: waiting periods run down and the moratorium clock keeps counting. That’s why renewing on time matters more than with most policies.',
    ],
    rules: [
      rule(
        'A health policy is renewable unless the product is withdrawn, or there is established fraud, non-disclosure or misrepresentation by the insured.',
        PPI_2024('page 29'),
      ),
      rule('The insurer can’t refuse renewal because you made claims in earlier years.', PPI_2024('page 29')),
      rule(
        'There’s no fresh underwriting at renewal unless you ask to raise the sum insured — and then only for the increase.',
        PPI_2024('page 29'),
      ),
      rule(
        'If your product is withdrawn, you can renew it once if your renewal falls within 90 days of the withdrawal, or move to another suitable product.',
        HEALTH_MC_2024('Chapter II, D.II para 5'),
      ),
      rule(
        'Where the insurer gives a no-claim bonus, you choose how to take it: extra sum insured with no extra premium, and/or a discount on renewal.',
        PPI_2024('page 29'),
      ),
      rule(
        'Renew within the grace period and every credit is protected — sum insured, no-claim bonus, waiting periods and the moratorium period.',
        PPI_2024('page 28'),
      ),
    ],
    whatYouCanDo: [
      'Renew before the due date — or at the latest within the grace period.',
      'If the insurer refuses to renew, ask for the reason in writing, and complain if it’s because you claimed.',
      'Want more cover? Only the increase can be underwritten, so your existing cover isn’t at risk.',
    ],
    keywords: ['renewal', 'renew', 'health renewal', 'refused renewal', 'renewal denied', 'no claim bonus', 'ncb', 'cumulative bonus', 'withdrawn product', 'sum insured', 'mediclaim'],
    related: ['grace-period', 'health-portability'],
  }),

  // ── Claiming ───────────────────────────────────────────────────────
  topic({
    id: 'claim-time-limits',
    group: 'CLAIMING',
    title: 'Claim time limits',
    summary: 'How long an insurer has to settle a claim — and what you’re owed when it’s late.',
    body: [
      'IRDAI sets deadlines for each kind of claim. The clock usually starts when you report the claim, so report it early and keep proof of the date.',
      'EveryPaisa’s claims tracker works these dates out for each claim you log.',
    ],
    rules: [
      CLAIM_GUIDES.LIFE_DEATH.rights[0]!,
      CLAIM_GUIDES.LIFE_MATURITY.rights[0]!,
      LATE_PAYMENT_INTEREST_LIFE,
      CLAIM_GUIDES.HEALTH_REIMBURSEMENT.rights[0]!,
      CLAIM_GUIDES.HEALTH_REIMBURSEMENT.rights[3]!,
      CLAIM_GUIDES.HEALTH_REIMBURSEMENT.rights[2]!,
      ...CLAIM_GUIDES.MOTOR_OWN_DAMAGE.rights,
    ],
    whatYouCanDo: [
      'Report the claim as soon as you can, and note the claim number and the date.',
      'Log the claim in EveryPaisa — it tracks the deadline and tells you when it’s time to complain.',
      'Past the deadline? Write to the insurer’s grievance cell and ask for the interest you’re owed.',
    ],
    keywords: ['claim time', 'claim deadline', 'how long', 'claim delay', 'delayed claim', 'late claim', 'settlement time', 'turnaround', 'claim interest', 'death claim', 'maturity', 'surveyor', 'survey', 'settle'],
    related: ['complaints', 'cashless'],
  }),

  topic({
    id: 'cashless',
    group: 'CLAIMING',
    title: 'Cashless hospital treatment',
    summary: 'At a network hospital the insurer pays directly — and has 1 hour to approve, and 3 hours to clear your discharge.',
    body: [
      'At a hospital in your insurer’s network, the insurer or its TPA (the claims administrator) pays the hospital directly, and you pay only for what the policy doesn’t cover.',
    ],
    rules: [
      ...CLAIM_GUIDES.HEALTH_CASHLESS.rights,
      CLAIM_GUIDES.HEALTH_REIMBURSEMENT.rights[1]!,
      rule(
        'IRDAI has asked insurers to strive for 100% cashless settlement, keeping reimbursement claims to exceptional cases.',
        HEALTH_MC_2024('Chapter I, para 15'),
      ),
      rule(
        'If the patient dies during treatment, the insurer must process the claim immediately and have the body released from the hospital at once.',
        HEALTH_MC_2024('Chapter I, para 16'),
      ),
      rule(
        'Insurers must list their cashless network hospitals on their websites, and make clear that treatment elsewhere is claimed by reimbursement.',
        HEALTH_MC_2024('Chapter II, A.I para 5'),
      ),
    ],
    whatYouCanDo: [
      'Before a planned admission, check the hospital is in the network on the insurer’s website or app.',
      'At admission, give the health card and photo ID to the hospital’s insurance desk.',
      'Before discharge, ask which items weren’t approved and why.',
      'Note when the hospital asked for discharge approval: extra charges for a wait beyond 3 hours are the insurer’s to bear.',
    ],
    keywords: ['cashless', 'network hospital', 'tpa', 'pre-authorisation', 'preauthorisation', 'pre-auth', 'hospital', 'discharge', 'admission', 'mediclaim', 'health card', 'hospitalisation'],
    related: ['multiple-health-policies', 'claim-time-limits'],
  }),

  topic({
    id: 'multiple-health-policies',
    group: 'CLAIMING',
    title: 'Claiming with more than one health policy',
    summary: 'You pick which health policy to claim under, and that insurer sorts out the rest with the others.',
    body: [
      'Many people have an employer’s group cover as well as a policy of their own. You don’t have to split a hospital bill between them yourself.',
    ],
    rules: [
      rule(
        'With indemnity policies (which pay your actual expenses), you choose which policy to claim under. If its cover is less than the admissible claim, that insurer must get your other policies’ details and coordinate with the other insurers to settle the balance, per the policy terms.',
        HEALTH_MC_2024('Chapter I, para 18'),
      ),
      rule(
        'With benefit policies (which pay a fixed amount when the insured event happens), you can claim from every insurer under every policy.',
        HEALTH_MC_2024('Chapter I, para 18'),
      ),
    ],
    whatYouCanDo: [
      'Keep all your health policies — including your employer’s — recorded in EveryPaisa.',
      'Choose the policy to claim under first, for example the one with the better room-rent or co-pay terms.',
      'If the bill is bigger than that policy’s cover, give that insurer your other policies’ details.',
    ],
    keywords: ['multiple policies', 'two policies', 'more than one policy', 'employer cover', 'group cover', 'corporate cover', 'top-up', 'second policy', 'primary insurer', 'mediclaim'],
    related: ['cashless'],
  }),

  topic({
    id: 'moratorium',
    group: 'CLAIMING',
    title: 'When your insurer can no longer question what you disclosed',
    summary: 'After 60 months of continuous health cover, non-disclosure can’t be raised except for established fraud; for life, three years.',
    body: [
      'When you buy cover you’re asked about your health and habits. If something was left out, an insurer might try to reject a claim years later on that ground. These rules put a time limit on that.',
      'The best protection is still to disclose everything when you apply.',
    ],
    rules: [
      rule(
        'No health policy or claim can be contested for non-disclosure or misrepresentation after the moratorium period — 60 months of continuous cover — except for established fraud.',
        HEALTH_MC_2024('Chapter I, para 13'),
      ),
      rule('Time on a ported or migrated policy counts towards the 60 months.', HEALTH_MC_2024('Chapter I, para 13')),
      rule(
        'A life policy can’t be called into question on any ground after three years from the latest of the policy date, the start of cover, a revival or a rider’s date.',
        PPI_2024('page 14'),
      ),
      rule('A life claim can’t be rejected without legally tenable evidence to support the rejection.', PPI_2024('page 14')),
    ],
    whatYouCanDo: [
      'Keep health cover continuous — renew on time, and port rather than let it lapse — so the 60 months keep counting.',
      'Disclose everything on proposal forms, and keep a copy.',
      'If a claim on an older policy is rejected for non-disclosure, check the dates and quote this rule in your complaint.',
    ],
    keywords: ['moratorium', '60 months', 'non-disclosure', 'nondisclosure', 'not disclosed', 'misrepresentation', 'contest', 'contestable', 'pre-existing', 'hidden illness', 'three years', 'section 45'],
    related: ['health-portability', 'complaints'],
  }),

  // ── When things go wrong ───────────────────────────────────────────
  topic({
    id: 'complaints',
    group: 'GOING_WRONG',
    title: 'Complaints: the insurer, then Bima Bharosa, then the Ombudsman',
    summary: 'Complain to the insurer first; if it says no or goes quiet, escalate — the Insurance Ombudsman is free.',
    body: [
      'Start with the insurer’s grievance cell. If it turns you down, pays short, or doesn’t answer, you can take it further — and the Ombudsman costs you nothing.',
    ],
    rules: [
      ...ESCALATION.rules,
      rule(
        'You can go to the Ombudsman in person, online at cioins.co.in, or in writing by post or email.',
        PPI_2024('page 19'),
      ),
      rule(
        'You can track a complaint on Bima Bharosa, on the insurer’s grievance portal, or through its call centre.',
        PPI_2024('page 19'),
      ),
      rule(
        'A health insurer’s reply to your grievance must give the contact details of the Ombudsman you can escalate to.',
        HEALTH_MC_2024('Chapter I, para 19'),
      ),
    ],
    whatYouCanDo: [
      'Write to the insurer’s grievance cell, or register on Bima Bharosa, with your policy and claim numbers, what went wrong and what you want. Keep the reference number.',
      `No reply in ${ESCALATION.grievanceReplyDays} days, or a reply you don’t accept? Follow it up on Bima Bharosa, or call ${ESCALATION.bimaBharosa.phones[0]}.`,
      'Turned down, or no answer after a month? File with the Insurance Ombudsman at cioins.co.in — within a year of the insurer’s rejection, for claims up to ₹50 lakh.',
      'Log the complaint against the claim in EveryPaisa so it tracks the dates for you.',
    ],
    keywords: ['complaint', 'complain', 'grievance', 'ombudsman', 'bima bharosa', 'escalate', 'rejected', 'claim rejected', 'repudiated', 'short paid', 'not paid', 'irdai', '155255'],
    related: ['claim-time-limits', 'mis-selling'],
  }),

  topic({
    id: 'mis-selling',
    group: 'GOING_WRONG',
    title: 'Mis-selling and fake calls',
    summary: 'Sold a policy you didn’t ask for or understand? You have options. And IRDAI never sells policies or offers refunds by phone.',
    body: [
      'Mis-selling is selling a policy on false or misleading claims — say, a savings plan described as a bank deposit, or returns promised that aren’t in the policy.',
      'The quickest remedy is the free-look period. After that, complain to the insurer, and escalate if it doesn’t put things right.',
    ],
    rules: [
      rule(
        'Insurers and their agents are responsible for how a policy is sold. Sales staff may use only the insurer’s approved prospectus, and insurers must act against those who mis-sell, up to blacklisting them.',
        PPI_2024('page 53'),
      ),
      rule(
        'For savings and annuity life policies, the insurer must assess whether the product suits you — your age, income, goals and the cover you already hold — and keep that record with the policy.',
        PPI_2024('page 52'),
      ),
      rule(
        'IRDAI and its officials don’t sell policies, announce bonuses, invest premiums or refund money. If you get such a call, report it to the police.',
        PPI_2024('page 20'),
      ),
      FREE_LOOK_LIFE,
      ESCALATION.rules[0]!,
    ],
    whatYouCanDo: [
      'Within 30 days of receiving the policy? Use the free-look period to cancel it.',
      'Write to the insurer’s grievance cell: what you were told, by whom and when, and what the policy actually says. Attach any messages or brochures.',
      'No fix? Register the complaint on Bima Bharosa, then take it to the Insurance Ombudsman.',
      'Never pay “charges” to a caller promising a refund or bonus on your policy.',
    ],
    keywords: ['mis-selling', 'mis-sold', 'missold', 'wrong policy', 'agent lied', 'misled', 'fraud call', 'fake call', 'spurious call', 'bonus call', 'refund call', 'without consent', 'cheated'],
    related: ['free-look-period', 'complaints'],
  }),

  topic({
    id: 'unclaimed-amounts',
    group: 'GOING_WRONG',
    title: 'Finding unclaimed insurance money',
    summary: 'Money an insurer couldn’t pay you stays claimable for decades — and you can search every insurer from one page.',
    body: [
      'Maturity payouts, refunds and claims can go unpaid when an insurer can’t reach you — a changed phone number, an old address or a closed bank account. The money isn’t lost; it waits to be claimed.',
    ],
    rules: [
      rule(
        'An unclaimed amount is money due to a policyholder or claimant that has stayed unpaid for more than 12 months after it fell due, because they couldn’t be reached.',
        PPI_2024('page 20'),
      ),
      rule(
        'You can search every insurer’s unclaimed amounts from one page on IRDAI’s Bima Bharosa site, or on the insurer’s own website.',
        PPI_2024('page 20'),
      ),
      rule(
        'A match needs any two of: policy number, the policyholder’s PAN, name and date of birth.',
        PPI_2024('pages 20–21'),
      ),
      rule(
        'Money unclaimed for 10 years moves to the Senior Citizens’ Welfare Fund — and can still be claimed through the insurer for 25 years after that.',
        PPI_2024('page 21'),
      ),
    ],
    whatYouCanDo: [
      'Search from Bima Bharosa’s unclaimed-amounts page, which links to every insurer’s search.',
      'Have two of these ready: policy number, PAN, name and date of birth.',
      'Found something? Claim it from that insurer, following its process.',
      'Keep your phone number, address and bank details up to date with each insurer so it doesn’t happen again.',
    ],
    keywords: ['unclaimed', 'unclaimed amount', 'lost policy', 'forgotten policy', 'old policy', 'parents policy', 'money not received', 'senior citizens welfare fund', 'search policy', 'find policy'],
    related: ['nomination'],
    extraSources: [BIMA_BHAROSA_UNCLAIMED],
  }),
];

// ── Lookup and search ────────────────────────────────────────────────

export function helpTopic(id: string): HelpTopic | null {
  return HELP_TOPICS.find((t) => t.id === id) ?? null;
}

export function topicsInGroup(group: HelpGroupId): HelpTopic[] {
  return HELP_TOPICS.filter((t) => t.group === group);
}

/** Lower case, hyphens and punctuation to spaces, curly quotes flattened. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9₹'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "nominees" → "nominee", "policies" → "polic" — enough for plurals. */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return word.slice(0, -3);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

const haystacks = new Map<string, string>(
  HELP_TOPICS.map((t) => [t.id, normalize([t.title, t.summary, ...t.keywords].join(' '))]),
);

/** For the search box: topics whose title, summary or keywords contain every word of `query`. */
export function filterHelpTopics(query: string): HelpTopic[] {
  const words = normalize(query).split(' ').filter(Boolean).map(stem);
  if (words.length === 0) return [...HELP_TOPICS];
  return HELP_TOPICS.filter((t) => {
    const hay = haystacks.get(t.id)!;
    return words.every((w) => hay.includes(w));
  });
}

const STOPWORDS = new Set(
  'a an and are can could do does for from have how i if in is it its me my of on or should the this to was what when where which who why will with you your policy insurance insurer'.split(' '),
);

/**
 * For the assistant: the topics a question is most likely about, best first.
 * A keyword phrase found in the question scores highest; a title word, less.
 */
export function matchHelpTopics(question: string, limit = 3): HelpTopic[] {
  const q = ` ${normalize(question)} `;
  if (q.trim() === '') return [];
  const qWords = new Set(q.trim().split(' ').map(stem));

  const scored = HELP_TOPICS.map((t, order) => {
    let score = 0;
    for (const k of t.keywords) {
      const phrase = normalize(k);
      if (!phrase) continue;
      if (q.includes(` ${phrase} `) || q.includes(` ${phrase}s `)) score += 2 + phrase.split(' ').length;
    }
    for (const w of normalize(t.title).split(' ').map(stem)) {
      if (w.length > 3 && !STOPWORDS.has(w) && qWords.has(w)) score += 1;
    }
    return { t, score, order };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, Math.max(0, limit))
    .map((s) => s.t);
}
