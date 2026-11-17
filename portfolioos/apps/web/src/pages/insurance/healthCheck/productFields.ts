/**
 * What the review screen shows for each product type: labels, groups, the
 * fields that must be present, and which fields take numbers / yes-no.
 */

import type { PolicyProductType } from '@everypaisa/shared';

export interface FieldSpec {
  labels: Record<string, string>;
  groups: Array<{ title: string; fields: string[] }>;
  critical: string[];
  numeric: Set<string>;
  boolean: Set<string>;
}

const HEALTH: FieldSpec = {
  labels: {
    insuredName: 'Insured Name',
    policyNumber: 'Policy Number',
    insurerName: 'Insurer',
    planName: 'Plan Name',
    policyType: 'Policy Type',
    policyStartDate: 'Start Date',
    policyEndDate: 'End Date',
    sumInsured: 'Sum Insured (₹)',
    premiumAmountInr: 'Annual Premium (₹)',
    copaymentPct: 'Co-payment (%)',
    roomRentLimitType: 'Room Rent Limit Type',
    roomRentLimitInr: 'Room Rent Limit (₹/day)',
    pedWaitingDays: 'PED Waiting Period (days)',
    initialWaitingDays: 'Initial Waiting Period (days)',
    ncbAvailable: 'No-Claim Bonus',
    restorationAvailable: 'Restoration Benefit',
    continuousCoverSince: 'Continuous cover since (date)',
    continuityCreditNote: 'Continuity / portability credit wording',
    specificDiseaseWaitingDays: 'Specific Disease Waiting (days)',
  },
  groups: [
    { title: 'Basic Information', fields: ['insuredName', 'policyNumber', 'insurerName', 'planName', 'policyType', 'policyStartDate', 'policyEndDate', 'sumInsured', 'premiumAmountInr'] },
    { title: 'Financial Restrictions', fields: ['copaymentPct', 'roomRentLimitType', 'roomRentLimitInr', 'proportionateDeductionApplies', 'deductibleInr'] },
    { title: 'Waiting Periods', fields: ['initialWaitingDays', 'pedWaitingDays', 'specificDiseaseWaitingDays'] },
    { title: 'Continuity of Cover', fields: ['continuousCoverSince', 'continuityCreditNote'] },
    { title: 'Benefits', fields: ['ncbAvailable', 'restorationAvailable', 'opdCovered', 'healthCheckupCovered'] },
  ],
  critical: ['sumInsured', 'policyType'],
  numeric: new Set(['initialWaitingDays', 'pedWaitingDays', 'specificDiseaseWaitingDays']),
  boolean: new Set(['proportionateDeductionApplies', 'ncbAvailable', 'restorationAvailable', 'opdCovered', 'healthCheckupCovered']),
};

const TERM: FieldSpec = {
  labels: {
    insuredName: 'Life Insured',
    policyNumber: 'Policy Number',
    insurerName: 'Insurer',
    planName: 'Plan Name',
    policyStartDate: 'Start Date',
    ageAtEntry: 'Age at entry',
    smokerStatusDeclared: 'Smoker status declared',
    sumAssured: 'Sum Assured (₹)',
    policyTermYears: 'Policy term (years)',
    coverEndsAtAge: 'Cover ends at age (if stated)',
    premiumAmountInr: 'Annual Premium (₹)',
    premiumFrequency: 'Premium frequency',
    premiumType: 'Premium type (regular / limited / single)',
    premiumPayingTermYears: 'Premium paying term (years)',
    deathBenefitOption: 'How the benefit is paid',
    criticalIllnessCover: 'Critical illness cover',
    accidentalDeathBenefit: 'Accidental death benefit',
    waiverOfPremium: 'Waiver of premium',
    terminalIllnessBenefit: 'Terminal illness benefit',
    returnOfPremium: 'Return of premium',
    suicideExclusionMonths: 'Suicide exclusion (months)',
    gracePeriodDays: 'Grace period (days)',
    nomineePresent: 'Nominee recorded',
  },
  groups: [
    { title: 'Basic Information', fields: ['insuredName', 'policyNumber', 'insurerName', 'planName', 'policyStartDate', 'ageAtEntry', 'smokerStatusDeclared'] },
    { title: 'Cover and Premium', fields: ['sumAssured', 'policyTermYears', 'coverEndsAtAge', 'premiumAmountInr', 'premiumFrequency', 'premiumType', 'premiumPayingTermYears'] },
    { title: 'Payout and Benefits', fields: ['deathBenefitOption', 'criticalIllnessCover', 'accidentalDeathBenefit', 'waiverOfPremium', 'terminalIllnessBenefit', 'returnOfPremium'] },
    { title: 'Claim Terms', fields: ['suicideExclusionMonths', 'gracePeriodDays', 'nomineePresent'] },
  ],
  critical: ['sumAssured'],
  numeric: new Set(['ageAtEntry', 'policyTermYears', 'coverEndsAtAge', 'premiumPayingTermYears', 'suicideExclusionMonths', 'gracePeriodDays']),
  boolean: new Set(['criticalIllnessCover', 'accidentalDeathBenefit', 'waiverOfPremium', 'terminalIllnessBenefit', 'returnOfPremium', 'nomineePresent', 'coverIncreasesWithTime']),
};

export const FIELD_SPECS: Record<PolicyProductType, FieldSpec> = { HEALTH, TERM };

/** The server validates corrections against the extraction schema, so send real numbers / booleans. */
export function coerceInput(spec: FieldSpec, key: string, raw: string): unknown {
  const t = raw.trim();
  if (t === '') return null;
  if (spec.numeric.has(key)) return /^\d+$/.test(t) ? Number(t) : t;
  if (spec.boolean.has(key)) {
    if (/^(true|yes|y)$/i.test(t)) return true;
    if (/^(false|no|n)$/i.test(t)) return false;
  }
  return t;
}

export function fieldTitle(spec: FieldSpec, key: string): string {
  const base = key.split('.')[0]!;
  const sub = key.includes('.') ? ` (${key.split('.').slice(1).join('.')})` : '';
  return (spec.labels[base] ?? base.replace(/([A-Z])/g, ' $1').toLowerCase()) + sub;
}

/** Report "parameter" table rows per product type. */
export const REPORT_PARAMETERS: Record<PolicyProductType, Array<{ label: string; category: string; keys: string[] }>> = {
  HEALTH: [
    { label: 'Co-payment', category: 'CO_PAYMENT', keys: ['copaymentPct'] },
    { label: 'Room rent', category: 'ROOM_RENT', keys: ['roomRentLimitType', 'roomRentLimitInr', 'roomRentLimitPct', 'proportionateDeductionApplies'] },
    { label: 'Disease sub-limits', category: 'SUB_LIMIT', keys: ['diseaseSubLimits'] },
    { label: 'Waiting periods', category: 'WAITING_PERIOD', keys: ['initialWaitingDays', 'pedWaitingDays', 'specificDiseaseWaitingDays'] },
    { label: 'No-claim bonus', category: 'NCB', keys: ['ncbAvailable', 'ncbIncrementPct', 'ncbMaxPct'] },
    { label: 'Restoration', category: 'RESTORATION', keys: ['restorationAvailable', 'restorationCount', 'restorationForSameIllness'] },
    { label: 'Exclusions', category: 'EXCLUSION', keys: ['permanentExclusions', 'specificExclusions'] },
  ],
  TERM: [
    { label: 'Cover and term', category: 'COVERAGE', keys: ['sumAssured', 'policyTermYears', 'ageAtEntry', 'coverEndsAtAge'] },
    { label: 'Payout structure', category: 'PAYOUT', keys: ['deathBenefitOption', 'coverIncreasesWithTime'] },
    { label: 'Claim terms', category: 'CLAIM_TERMS', keys: ['suicideExclusionMonths', 'gracePeriodDays', 'nomineePresent'] },
    { label: 'Riders and benefits', category: 'BENEFIT', keys: ['criticalIllnessCover', 'accidentalDeathBenefit', 'waiverOfPremium', 'terminalIllnessBenefit'] },
    { label: 'Premium structure', category: 'PREMIUM', keys: ['premiumType', 'premiumFrequency', 'premiumPayingTermYears', 'returnOfPremium'] },
    { label: 'Exclusions', category: 'EXCLUSION', keys: ['exclusions'] },
  ],
};
