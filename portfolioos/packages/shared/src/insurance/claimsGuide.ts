/**
 * Claims assistant: what to do, what to keep, and what the insurer owes you,
 * for each kind of claim — plus where a claim stands and what to do next.
 *
 * Every "right" quoted here is IRDAI's rule, paraphrased, with the page it
 * comes from (checked on SOURCES_CHECKED_ON). Steps and document lists are
 * the usual practice; each insurer's own claim form has the final say, and
 * the UI says so. Deadlines err towards the insurer: we only ever say a claim
 * is late once the most generous reading of the rule has passed.
 */
import { Decimal } from '../decimal.js';
import { addDaysIso, daysBetweenIso } from './premiumSchedule.js';

export const SOURCES_CHECKED_ON = '2026-09-11';

export interface OfficialSource {
  label: string;
  url: string;
  /** Where in the document, e.g. "page 31". */
  where?: string;
}

const PPI_2024 = (where: string): OfficialSource => ({
  label: "IRDAI Master Circular on Protection of Policyholders' Interests, 2024",
  url: 'https://irdai.gov.in/document-detail?documentId=5625747',
  where,
});

const OMBUDSMAN_FAQ: OfficialSource = {
  label: 'Council for Insurance Ombudsmen — FAQs',
  url: 'https://www.cioins.co.in/Faqs',
};

const BIMA_BHAROSA_CALL_CENTRE: OfficialSource = {
  label: 'IRDAI Bima Bharosa — grievance call centre',
  url: 'https://bimabharosa.irdai.gov.in/Home/CallCenter',
};

export const CLAIM_KINDS = [
  'HEALTH_CASHLESS',
  'HEALTH_REIMBURSEMENT',
  'LIFE_DEATH',
  'LIFE_MATURITY',
  'MOTOR_OWN_DAMAGE',
  'MOTOR_THEFT',
  'HOME',
  'PERSONAL_ACCIDENT',
  'TRAVEL',
] as const;

export type ClaimKind = (typeof CLAIM_KINDS)[number];

export interface ClaimStep {
  title: string;
  detail: string;
}

export interface ClaimDocument {
  /** Stable id — ticked-off state is stored against it. */
  id: string;
  label: string;
  note?: string;
}

export interface ClaimRight {
  text: string;
  source: OfficialSource;
}

/** When the insurer's decision is due: `days` after `from`, at most `latestDays` (e.g. with investigation). */
export interface DecisionClock {
  from: 'CLAIM' | 'DOCUMENTS' | 'SURVEYOR';
  days: number;
  latestDays?: number;
  label: string;
}

export interface ClaimGuide {
  kind: ClaimKind;
  title: string;
  summary: string;
  /** Policy types this guide is for. */
  appliesTo: readonly string[];
  steps: ClaimStep[];
  documents: ClaimDocument[];
  rights: ClaimRight[];
  clock: DecisionClock | null;
}

const LIFE = ['TERM', 'WHOLE_LIFE', 'ULIP', 'ENDOWMENT'];

const SURVEY_RIGHTS: ClaimRight[] = [
  {
    text: 'A surveyor must be appointed within 24 hours of the claim being reported. A survey is required for losses of ₹50,000 or more on motor, or ₹1 lakh or more on other policies.',
    source: PPI_2024('pages 45–46'),
  },
  {
    text: 'The survey report is due within 15 days of the surveyor’s appointment. For every day it is late, ₹500 is payable to you.',
    source: PPI_2024('page 46'),
  },
  {
    text: 'The insurer must decide on the claim within 7 days of receiving the survey report.',
    source: PPI_2024('page 46'),
  },
];

const SURVEY_CLOCK: DecisionClock = {
  from: 'SURVEYOR',
  days: 22,
  label: 'Survey report within 15 days of the surveyor’s appointment, then a decision within 7 days',
};

export const CLAIM_GUIDES: Record<ClaimKind, ClaimGuide> = {
  HEALTH_CASHLESS: {
    kind: 'HEALTH_CASHLESS',
    title: 'Cashless hospitalisation',
    summary: 'At a network hospital, the insurer pays the hospital directly. You pay only what the policy doesn’t cover.',
    appliesTo: ['HEALTH'],
    steps: [
      { title: 'Check the hospital is in the network', detail: 'Ask the hospital’s insurance (TPA) desk, or look it up on the insurer’s site or app.' },
      { title: 'Tell the insurer', detail: 'For a planned admission, a few days before. For an emergency, as soon as you can — the hospital desk can do it for you.' },
      { title: 'Hand over the health card and ID', detail: 'The hospital sends the pre-authorisation request with the doctor’s notes.' },
      { title: 'Before discharge, check the final bill', detail: 'Ask which items the insurer hasn’t approved and why, and pay only those.' },
      { title: 'Keep copies', detail: 'Discharge summary, final bill and the approval letter — you’ll need them if any part is disputed.' },
    ],
    documents: [
      { id: 'health_card', label: 'Health card or e-card' },
      { id: 'photo_id', label: 'Photo ID of the patient (Aadhaar, PAN, passport…)' },
      { id: 'doctor_advice', label: 'Doctor’s advice for admission' },
      { id: 'policy_copy', label: 'Policy copy or policy number' },
    ],
    rights: [
      { text: 'The insurer must decide on a cashless request within 1 hour.', source: PPI_2024('page 30') },
      {
        text: 'Final approval for discharge is due within 3 hours of the hospital’s request. Anything extra the hospital charges for a longer wait is paid by the insurer.',
        source: PPI_2024('page 31'),
      },
      {
        text: 'A claim can be rejected only with the approval of the insurer’s Claims Review Committee, and the reasons must quote the policy terms.',
        source: PPI_2024('page 31'),
      },
    ],
    clock: null,
  },

  HEALTH_REIMBURSEMENT: {
    kind: 'HEALTH_REIMBURSEMENT',
    title: 'Reimbursement',
    summary: 'You paid the hospital yourself, and now claim the money back from the insurer.',
    appliesTo: ['HEALTH'],
    steps: [
      { title: 'Tell the insurer', detail: 'As early as you can, by its helpline, app, website or TPA. Note the claim number.' },
      { title: 'Collect originals before leaving hospital', detail: 'Discharge summary, final and itemised bills, receipts, reports and prescriptions.' },
      { title: 'Submit the claim form', detail: 'With the bills and your bank details, within the time your policy states.' },
      { title: 'Answer queries once', detail: 'The insurer should ask for everything in one go. Keep copies of what you send.' },
      { title: 'Check the settlement letter', detail: 'If anything is deducted, it must be explained against the policy terms.' },
    ],
    documents: [
      { id: 'claim_form', label: 'Claim form, signed' },
      { id: 'discharge_summary', label: 'Discharge summary' },
      { id: 'final_bill', label: 'Final hospital bill, with itemised break-up' },
      { id: 'payment_receipts', label: 'Payment receipts' },
      { id: 'pharmacy_bills', label: 'Pharmacy bills with prescriptions' },
      { id: 'reports', label: 'Test and investigation reports' },
      { id: 'bank_details', label: 'Cancelled cheque or bank details' },
      { id: 'photo_id', label: 'Photo ID and KYC of the policyholder' },
    ],
    rights: [
      {
        text: 'Claims other than cashless must be settled within 15 days of the claim being submitted.',
        source: PPI_2024('page 31'),
      },
      {
        text: 'The insurer or its TPA should collect the documents from the hospital — you are not required to submit them.',
        source: PPI_2024('page 31'),
      },
      {
        text: 'No claim may be rejected or closed for late intimation or for want of documents.',
        source: PPI_2024('page 30'),
      },
      {
        text: 'If a claim is settled late, you are owed interest at 2% above the bank rate from the day you reported it, paid without asking.',
        source: PPI_2024('page 30'),
      },
      {
        text: 'A claim can be rejected only with the approval of the insurer’s Claims Review Committee, and the reasons must quote the policy terms.',
        source: PPI_2024('page 31'),
      },
    ],
    clock: { from: 'DOCUMENTS', days: 15, label: 'Settled within 15 days of the claim being submitted' },
  },

  LIFE_DEATH: {
    kind: 'LIFE_DEATH',
    title: 'Death claim',
    summary: 'The nominee claims the sum assured after the policyholder’s death.',
    appliesTo: LIFE,
    steps: [
      { title: 'Tell the insurer', detail: 'By its helpline, a branch or the website, with the policy number and date of death.' },
      { title: 'Get the death certificate', detail: 'From the local municipal authority. Keep several attested copies.' },
      { title: 'Fill in the claim form', detail: 'The nominee signs it and adds bank details. If there’s no nominee, the insurer will ask for proof of legal heirship.' },
      { title: 'Add the extra papers for your case', detail: 'Hospital records for an illness; police FIR and post-mortem report for an accident.' },
      { title: 'Follow up on the date', detail: 'Note when you submitted everything — the time limit runs from when you reported the claim.' },
    ],
    documents: [
      { id: 'claim_form', label: 'Claim form signed by the nominee' },
      { id: 'death_certificate', label: 'Death certificate from the local authority' },
      { id: 'policy_document', label: 'Original policy document', note: 'Lost? Ask the insurer for an indemnity form.' },
      { id: 'nominee_id', label: 'Nominee’s photo ID and address proof' },
      { id: 'bank_details', label: 'Nominee’s cancelled cheque or bank details' },
      { id: 'medical_records', label: 'Medical records / cause-of-death certificate', note: 'If the death followed an illness.' },
      { id: 'fir_postmortem', label: 'Police FIR and post-mortem report', note: 'If the death was an accident or unnatural.' },
    ],
    rights: [
      {
        text: 'A death claim must be settled within 15 days of being reported — or within 45 days if the circumstances call for an investigation.',
        source: PPI_2024('page 15'),
      },
    ],
    clock: { from: 'CLAIM', days: 15, latestDays: 45, label: 'Within 15 days of the claim, or 45 if the insurer investigates' },
  },

  LIFE_MATURITY: {
    kind: 'LIFE_MATURITY',
    title: 'Maturity or survival benefit',
    summary: 'The policy has reached its maturity date (or a payout date) and the money is due to you.',
    appliesTo: ['WHOLE_LIFE', 'ULIP', 'ENDOWMENT'],
    steps: [
      { title: 'Watch for the insurer’s letter', detail: 'It usually arrives a few weeks before the date, with a discharge form.' },
      { title: 'Update your bank details', detail: 'Payouts go by bank transfer — make sure the account on record is current.' },
      { title: 'Return the signed form', detail: 'With the policy document if the insurer asks for it.' },
    ],
    documents: [
      { id: 'discharge_form', label: 'Discharge voucher / maturity claim form' },
      { id: 'policy_document', label: 'Original policy document' },
      { id: 'photo_id', label: 'Photo ID and address proof' },
      { id: 'bank_details', label: 'Cancelled cheque or bank details' },
    ],
    rights: [
      { text: 'Maturity and survival benefits are to be paid on the due date.', source: PPI_2024('page 15') },
      { text: 'A surrender or partial withdrawal is to be paid within 7 days of the request.', source: PPI_2024('page 15') },
    ],
    clock: { from: 'CLAIM', days: 0, label: 'Paid on the due date' },
  },

  MOTOR_OWN_DAMAGE: {
    kind: 'MOTOR_OWN_DAMAGE',
    title: 'Accident damage to your vehicle',
    summary: 'Repairs to your own vehicle after an accident, under a comprehensive or own-damage cover.',
    appliesTo: ['MOTOR'],
    steps: [
      { title: 'Make it safe and take photos', detail: 'Of the damage, the scene and the other vehicle’s number plate if one was involved.' },
      { title: 'Tell the insurer before any repair', detail: 'By its helpline or app. Note the claim number.' },
      { title: 'Police report if needed', detail: 'File an FIR if someone was hurt or another party’s property was damaged.' },
      { title: 'Take the vehicle to a garage', detail: 'A network garage can repair it cashless; elsewhere, you pay and claim back.' },
      { title: 'Let the surveyor inspect', detail: 'Don’t start repairs until the surveyor has seen the damage or the insurer says so.' },
    ],
    documents: [
      { id: 'claim_form', label: 'Claim form' },
      { id: 'rc', label: 'Registration certificate (RC)' },
      { id: 'driving_licence', label: 'Driving licence of whoever was driving' },
      { id: 'policy_copy', label: 'Policy copy' },
      { id: 'photos', label: 'Photos of the damage' },
      { id: 'fir', label: 'Police FIR', note: 'If anyone was hurt or third-party property was damaged.' },
      { id: 'repair_estimate', label: 'Repair estimate from the garage' },
      { id: 'final_invoice', label: 'Final repair invoice and payment receipt', note: 'For a reimbursement claim.' },
    ],
    rights: SURVEY_RIGHTS,
    clock: SURVEY_CLOCK,
  },

  MOTOR_THEFT: {
    kind: 'MOTOR_THEFT',
    title: 'Vehicle stolen',
    summary: 'Your vehicle has been stolen and not recovered.',
    appliesTo: ['MOTOR'],
    steps: [
      { title: 'File a police FIR at once', detail: 'Get a copy with the FIR number.' },
      { title: 'Tell the insurer', detail: 'The same day if you can, with the FIR number.' },
      { title: 'Tell the RTO', detail: 'Inform the regional transport office of the theft in writing.' },
      { title: 'Wait for the police report', detail: 'The claim is usually settled after the police issue a report that the vehicle couldn’t be traced.' },
      { title: 'Hand over keys and papers', detail: 'The insurer will ask for all keys and for transfer papers in its name.' },
    ],
    documents: [
      { id: 'fir', label: 'Police FIR' },
      { id: 'claim_form', label: 'Claim form' },
      { id: 'rc', label: 'Registration certificate (RC)' },
      { id: 'keys', label: 'All original keys' },
      { id: 'police_final_report', label: 'Police final report (vehicle not traced)' },
      { id: 'rto_letter', label: 'Copy of your letter to the RTO' },
      { id: 'policy_copy', label: 'Policy copy' },
    ],
    rights: SURVEY_RIGHTS.slice(0, 1),
    clock: null,
  },

  HOME: {
    kind: 'HOME',
    title: 'Home and contents',
    summary: 'Damage to your home or belongings from fire, flood, burglary or another covered event.',
    appliesTo: ['HOME'],
    steps: [
      { title: 'Limit the damage', detail: 'Do what you safely can to stop it getting worse — and keep damaged items for the surveyor.' },
      { title: 'Report it', detail: 'Police FIR for a theft or burglary; the fire brigade’s report for a fire.' },
      { title: 'Tell the insurer', detail: 'With photos and a first list of what was lost or damaged.' },
      { title: 'Meet the surveyor', detail: 'Show the damage and share bills or valuations for the items.' },
    ],
    documents: [
      { id: 'claim_form', label: 'Claim form' },
      { id: 'photos', label: 'Photos and videos of the damage' },
      { id: 'loss_list', label: 'List of items lost or damaged, with values' },
      { id: 'bills', label: 'Purchase bills or valuations' },
      { id: 'fir', label: 'Police FIR', note: 'For theft or burglary.' },
      { id: 'fire_report', label: 'Fire brigade report', note: 'For a fire.' },
    ],
    rights: SURVEY_RIGHTS,
    clock: SURVEY_CLOCK,
  },

  PERSONAL_ACCIDENT: {
    kind: 'PERSONAL_ACCIDENT',
    title: 'Accident — injury, disability or death',
    summary: 'A lump sum for accidental death or disability, as the policy sets out.',
    appliesTo: ['PERSONAL_ACCIDENT'],
    steps: [
      { title: 'Tell the insurer', detail: 'As soon as you can after the accident.' },
      { title: 'Keep the medical records', detail: 'Treatment papers, and a disability certificate from the treating doctor or a medical board if relevant.' },
      { title: 'Police papers', detail: 'FIR — and for a death, the post-mortem report.' },
      { title: 'Submit the claim form', detail: 'With bank details of the insured person, or of the nominee for a death claim.' },
    ],
    documents: [
      { id: 'claim_form', label: 'Claim form' },
      { id: 'fir', label: 'Police FIR' },
      { id: 'medical_records', label: 'Medical records and bills' },
      { id: 'disability_certificate', label: 'Disability certificate', note: 'For a disability claim.' },
      { id: 'death_postmortem', label: 'Death certificate and post-mortem report', note: 'For a death claim.' },
      { id: 'bank_details', label: 'Cancelled cheque or bank details' },
    ],
    rights: [],
    clock: null,
  },

  TRAVEL: {
    kind: 'TRAVEL',
    title: 'Travel',
    summary: 'Medical treatment abroad, lost baggage or passport, or a delayed or cancelled trip.',
    appliesTo: ['TRAVEL'],
    steps: [
      { title: 'Call the insurer’s travel assistance', detail: 'Before treatment where you can — they may arrange cashless care abroad.' },
      { title: 'Get a report of the loss', detail: 'From the airline for baggage (a property irregularity report), or the police for a theft.' },
      { title: 'Keep every bill and ticket', detail: 'Medical bills, tickets and boarding passes, and receipts for extra costs.' },
      { title: 'Claim after you return', detail: 'Within the time the policy states.' },
    ],
    documents: [
      { id: 'claim_form', label: 'Claim form' },
      { id: 'passport', label: 'Passport pages with the travel stamps' },
      { id: 'tickets', label: 'Tickets and boarding passes' },
      { id: 'medical_bills', label: 'Medical bills and reports', note: 'For a medical claim.' },
      { id: 'loss_report', label: 'Airline or police report', note: 'For lost baggage, passport or theft.' },
      { id: 'bank_details', label: 'Cancelled cheque or bank details' },
    ],
    rights: [],
    clock: null,
  },
};

/** How to escalate a claim the insurer turns down, short-pays or sits on. */
export const ESCALATION = {
  /** The insurer must answer a complaint within this many days. */
  grievanceReplyDays: 14,
  /** Unanswered this long (or answered unsatisfactorily), a complaint can go to the Ombudsman. */
  ombudsmanAfterDays: 30,
  /** The Ombudsman takes complaints up to this claim value (₹). */
  ombudsmanMaxClaim: '5000000',
  /** The insurer must comply with an Ombudsman award within this many days (₹5,000 a day after). */
  awardComplianceDays: 30,
  bimaBharosa: {
    name: 'Bima Bharosa (IRDAI)',
    url: 'https://bimabharosa.irdai.gov.in/',
    phones: ['155255', '1800 4254 732'],
    email: 'complaints@irdai.gov.in',
    source: BIMA_BHAROSA_CALL_CENTRE,
  },
  ombudsman: {
    name: 'Insurance Ombudsman',
    url: 'https://www.cioins.co.in/',
    source: OMBUDSMAN_FAQ,
  },
  rules: [
    {
      text: 'The insurer must acknowledge a complaint at once and resolve it within 14 days, giving reasons with reference to the policy terms.',
      source: PPI_2024('page 19'),
    },
    {
      text: 'You can register a complaint with any insurer on IRDAI’s Bima Bharosa portal, or call 155255 / 1800 4254 732.',
      source: BIMA_BHAROSA_CALL_CENTRE,
    },
    {
      text: 'If the insurer rejects your complaint, or doesn’t reply within a month, you can go to the Insurance Ombudsman — free of charge, within one year of the insurer’s rejection, for claims up to ₹50 lakh.',
      source: OMBUDSMAN_FAQ,
    },
    {
      text: 'The insurer must comply with an Ombudsman award within 30 days, or pay you ₹5,000 for every day of delay.',
      source: PPI_2024('page 19'),
    },
  ] as ClaimRight[],
} as const;

/** The guides that fit a policy type, in the order to offer them. */
export function guidesForPolicyType(type: string): ClaimGuide[] {
  return Object.values(CLAIM_GUIDES).filter((g) => g.appliesTo.includes(type));
}

export function isClaimKind(v: unknown): v is ClaimKind {
  return typeof v === 'string' && (CLAIM_KINDS as readonly string[]).includes(v);
}

// ── Where a claim stands ────────────────────────────────────────────

export interface ClaimTrackInput {
  kind: string | null;
  status: string;
  claimDate: string;
  documentsCompletedOn: string | null;
  surveyorAllocatedOn: string | null;
  claimedAmount: string;
  settledAmount: string | null;
  grievanceFiledOn: string | null;
  ombudsmanFiledOn: string | null;
}

export type ClaimStage =
  | 'REPORTED'
  | 'IN_PROGRESS'
  | 'SETTLED'
  | 'SHORT_PAID'
  | 'REJECTED'
  | 'COMPLAINT_FILED'
  | 'WITH_OMBUDSMAN';

export type ClaimAction = 'WAIT' | 'FILE_GRIEVANCE' | 'GO_TO_OMBUDSMAN' | 'NONE';

export interface ClaimProgress {
  stage: ClaimStage;
  /** When IRDAI's time limit says the decision is due (null when no day limit applies). */
  decisionDueOn: string | null;
  /** The latest it can be due (e.g. 45 days when a death claim is investigated). */
  latestDueOn: string | null;
  /** Days past `latestDueOn`, while still undecided. */
  overdueDays: number | null;
  /** Whether the claim is within the Ombudsman's ₹50 lakh limit. */
  withinOmbudsmanLimit: boolean;
  next: { action: ClaimAction; dueOn: string | null; reason: string };
}

const d10 = (s: string) => s.slice(0, 10);

function clockBase(clock: DecisionClock, c: ClaimTrackInput): string {
  switch (clock.from) {
    case 'DOCUMENTS':
      return d10(c.documentsCompletedOn ?? c.claimDate);
    case 'SURVEYOR':
      // Without a recorded appointment, assume the 24-hour rule was met.
      return c.surveyorAllocatedOn ? d10(c.surveyorAllocatedOn) : addDaysIso(d10(c.claimDate), 1);
    default:
      return d10(c.claimDate);
  }
}

function fmt(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function claimProgress(c: ClaimTrackInput, todayIso: string): ClaimProgress {
  const today = d10(todayIso);
  const guide = isClaimKind(c.kind) ? CLAIM_GUIDES[c.kind] : null;
  const clock = guide?.clock ?? null;
  const base = clock ? clockBase(clock, c) : null;
  const decisionDueOn = clock && base ? addDaysIso(base, clock.days) : null;
  const latestDueOn = clock && base ? addDaysIso(base, clock.latestDays ?? clock.days) : null;

  const claimed = new Decimal(c.claimedAmount);
  const settled = c.settledAmount != null ? new Decimal(c.settledAmount) : null;
  const shortPaid = c.status === 'SETTLED' && settled !== null && settled.lessThan(claimed);
  const withinOmbudsmanLimit = claimed.lessThanOrEqualTo(ESCALATION.ombudsmanMaxClaim);
  const decided = c.status === 'SETTLED' || c.status === 'REJECTED';
  const overdueDays =
    !decided && latestDueOn && today > latestDueOn ? daysBetweenIso(latestDueOn, today) : null;

  const result = (stage: ClaimStage, next: ClaimProgress['next']): ClaimProgress => ({
    stage,
    decisionDueOn,
    latestDueOn,
    overdueDays,
    withinOmbudsmanLimit,
    next,
  });

  if (c.ombudsmanFiledOn) {
    return result('WITH_OMBUDSMAN', {
      action: 'NONE',
      dueOn: null,
      reason: `With the Insurance Ombudsman. If it rules for you, the insurer has ${ESCALATION.awardComplianceDays} days to comply.`,
    });
  }

  if (c.status === 'SETTLED' && !shortPaid) {
    return result('SETTLED', { action: 'NONE', dueOn: null, reason: 'Settled in full.' });
  }

  if (c.grievanceFiledOn) {
    const filed = d10(c.grievanceFiledOn);
    const replyDue = addDaysIso(filed, ESCALATION.grievanceReplyDays);
    const ombudsmanFrom = addDaysIso(filed, ESCALATION.ombudsmanAfterDays);
    if (today < replyDue) {
      return result('COMPLAINT_FILED', {
        action: 'WAIT',
        dueOn: replyDue,
        reason: `The insurer must answer your complaint by ${fmt(replyDue)}.`,
      });
    }
    if (today < ombudsmanFrom) {
      return result('COMPLAINT_FILED', {
        action: 'WAIT',
        dueOn: ombudsmanFrom,
        reason:
          `The insurer’s answer was due ${fmt(replyDue)}. If it has turned your complaint down, you can go to the ` +
          `Insurance Ombudsman now; if it hasn’t replied, from ${fmt(ombudsmanFrom)}.`,
      });
    }
    return result('COMPLAINT_FILED', {
      action: 'GO_TO_OMBUDSMAN',
      dueOn: null,
      reason: withinOmbudsmanLimit
        ? 'You can take this to the Insurance Ombudsman — it’s free, and must be within a year of the insurer’s rejection.'
        : 'The claim is above the Ombudsman’s ₹50 lakh limit, so a consumer commission or a civil court is the next step.',
    });
  }

  if (c.status === 'REJECTED' || shortPaid) {
    return result(shortPaid ? 'SHORT_PAID' : 'REJECTED', {
      action: 'FILE_GRIEVANCE',
      dueOn: null,
      reason:
        'Write to the insurer’s grievance cell, or register a complaint on Bima Bharosa. ' +
        `The insurer must reply within ${ESCALATION.grievanceReplyDays} days.`,
    });
  }

  const stage: ClaimStage =
    c.status === 'UNDER_REVIEW' || c.status === 'APPROVED' || c.documentsCompletedOn || c.surveyorAllocatedOn
      ? 'IN_PROGRESS'
      : 'REPORTED';

  if (latestDueOn && today > latestDueOn) {
    return result(stage, {
      action: 'FILE_GRIEVANCE',
      dueOn: null,
      reason:
        `The insurer is past IRDAI’s time limit (${fmt(latestDueOn)}). Complain to its grievance cell or on Bima Bharosa.` +
        (c.kind === 'HEALTH_REIMBURSEMENT' ? ' You are also owed interest for the delay.' : ''),
    });
  }
  if (decisionDueOn && latestDueOn) {
    if (today <= decisionDueOn) {
      return result(stage, {
        action: 'WAIT',
        dueOn: decisionDueOn,
        reason: `The decision is due by ${fmt(decisionDueOn)}.`,
      });
    }
    return result(stage, {
      action: 'WAIT',
      dueOn: latestDueOn,
      reason: `Past ${fmt(decisionDueOn)}. If the insurer is investigating, it has until ${fmt(latestDueOn)} — ask it to confirm in writing.`,
    });
  }
  return result(stage, {
    action: 'WAIT',
    dueOn: null,
    reason: 'Follow up with the insurer if you haven’t heard back, and note each call here.',
  });
}
