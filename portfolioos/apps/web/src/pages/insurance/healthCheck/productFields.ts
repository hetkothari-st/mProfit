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

const SAVINGS: FieldSpec = {
  labels: {
    insuredName: 'Life Insured',
    policyNumber: 'Policy Number',
    insurerName: 'Insurer',
    planName: 'Plan Name',
    policyStartDate: 'Start Date',
    ageAtEntry: 'Age at entry',
    sumAssured: 'Sum Assured (₹)',
    policyTermYears: 'Policy term (years)',
    premiumPayingTermYears: 'Premium paying term (years)',
    premiumAmountInr: 'Annual Premium (₹)',
    premiumFrequency: 'Premium frequency',
    premiumType: 'Premium type (regular / limited / single)',
    maturityBenefitGuaranteedInr: 'Guaranteed maturity amount (₹)',
    maturityBenefitIllustratedInr: 'Illustrated maturity amount (₹, not guaranteed)',
    participating: 'Shares in insurer profits (bonuses)',
    survivalBenefits: 'Money-back / survival benefits',
    guaranteedSurrenderFromYear: 'Guaranteed surrender value from year',
    loanAvailable: 'Loan against policy',
    premiumAllocationChargePct: 'First-year premium allocation charge (%)',
    fundManagementChargePct: 'Fund management charge (% a year)',
    policyAdminChargeStated: 'Policy administration charge stated',
    mortalityChargeStated: 'Mortality charge stated',
    lockInYears: 'Lock-in (years)',
    freeSwitchesPerYear: 'Free fund switches per year',
    ulipDeathBenefitBasis: 'ULIP death benefit basis',
    fundOptions: 'Fund options',
    suicideExclusionMonths: 'Suicide exclusion (months)',
    gracePeriodDays: 'Grace period (days)',
    freeLookDays: 'Free-look period (days)',
    nomineePresent: 'Nominee recorded',
  },
  groups: [
    { title: 'Basic Information', fields: ['insuredName', 'policyNumber', 'insurerName', 'planName', 'policyStartDate', 'ageAtEntry'] },
    { title: 'Cover and Premium', fields: ['sumAssured', 'policyTermYears', 'premiumPayingTermYears', 'premiumAmountInr', 'premiumFrequency', 'premiumType'] },
    { title: 'What You Get Back', fields: ['maturityBenefitGuaranteedInr', 'maturityBenefitIllustratedInr', 'participating', 'survivalBenefits', 'guaranteedSurrenderFromYear', 'loanAvailable'] },
    { title: 'ULIP Charges and Lock-in', fields: ['premiumAllocationChargePct', 'fundManagementChargePct', 'policyAdminChargeStated', 'mortalityChargeStated', 'lockInYears', 'freeSwitchesPerYear', 'ulipDeathBenefitBasis'] },
    { title: 'Claim Terms', fields: ['suicideExclusionMonths', 'gracePeriodDays', 'freeLookDays', 'nomineePresent'] },
  ],
  critical: ['sumAssured'],
  numeric: new Set(['ageAtEntry', 'policyTermYears', 'premiumPayingTermYears', 'guaranteedSurrenderFromYear', 'lockInYears', 'freeSwitchesPerYear', 'suicideExclusionMonths', 'gracePeriodDays', 'freeLookDays']),
  boolean: new Set(['participating', 'survivalBenefits', 'loanAvailable', 'policyAdminChargeStated', 'mortalityChargeStated', 'nomineePresent']),
};

const MOTOR: FieldSpec = {
  labels: {
    insuredName: 'Policyholder',
    policyNumber: 'Policy Number',
    insurerName: 'Insurer',
    planName: 'Plan Name',
    policyStartDate: 'Start Date',
    policyEndDate: 'Expiry Date',
    vehicleMake: 'Vehicle make',
    vehicleModel: 'Vehicle model',
    manufacturingYear: 'Year of manufacture',
    policyKind: 'Policy type (comprehensive / third party only / own damage only)',
    idvInr: 'Insured Declared Value (IDV) (₹)',
    premiumAmountInr: 'Total Premium (₹)',
    ncbPercent: 'No-claim bonus (%)',
    ncbProtect: 'No-claim bonus protection',
    zeroDepreciation: 'Zero depreciation cover',
    engineProtect: 'Engine protect',
    returnToInvoice: 'Return to invoice',
    consumablesCover: 'Consumables cover',
    roadsideAssistance: 'Roadside assistance',
    tyreProtect: 'Tyre protect',
    keyReplacement: 'Key replacement',
    ownerDriverPaInr: 'Owner-driver personal accident cover (₹)',
    passengerPaInr: 'Passenger personal accident cover (₹)',
    compulsoryDeductibleInr: 'Compulsory deductible (₹)',
    voluntaryDeductibleInr: 'Voluntary deductible (₹)',
  },
  groups: [
    { title: 'Basic Information', fields: ['insuredName', 'policyNumber', 'insurerName', 'planName', 'policyStartDate', 'policyEndDate', 'vehicleMake', 'vehicleModel', 'manufacturingYear'] },
    { title: 'Cover and Premium', fields: ['policyKind', 'idvInr', 'premiumAmountInr'] },
    { title: 'No-claim Bonus', fields: ['ncbPercent', 'ncbProtect'] },
    { title: 'Add-ons', fields: ['zeroDepreciation', 'engineProtect', 'returnToInvoice', 'consumablesCover', 'roadsideAssistance', 'tyreProtect', 'keyReplacement'] },
    { title: 'Personal Accident and Deductibles', fields: ['ownerDriverPaInr', 'passengerPaInr', 'compulsoryDeductibleInr', 'voluntaryDeductibleInr'] },
  ],
  critical: ['policyKind'],
  numeric: new Set(['manufacturingYear', 'ncbPercent']),
  boolean: new Set(['ncbProtect', 'zeroDepreciation', 'engineProtect', 'returnToInvoice', 'consumablesCover', 'roadsideAssistance', 'tyreProtect', 'keyReplacement']),
};

const HOME: FieldSpec = {
  labels: {
    insuredName: 'Policyholder',
    policyNumber: 'Policy Number',
    insurerName: 'Insurer',
    planName: 'Plan Name',
    policyStartDate: 'Start Date',
    policyEndDate: 'Expiry Date',
    policyTermYears: 'Policy term (years)',
    coverScope: 'What is covered (building / contents / both)',
    sumInsuredStructureInr: 'Building sum insured (₹)',
    sumInsuredContentsInr: 'Contents sum insured (₹)',
    valuationBasis: 'How a claim is valued (rebuild or replace new / market value / depreciated)',
    averageClause: 'Under-insurance (average) clause',
    premiumAmountInr: 'Total Premium (₹)',
    floodCovered: 'Flood and storm covered',
    earthquakeCovered: 'Earthquake covered',
    burglaryCovered: 'Burglary and theft covered',
    waterDamageCovered: 'Burst or leaking pipes covered',
    electronicsCovered: 'Appliance breakdown covered',
    valuablesCovered: 'Jewellery and valuables covered',
    valuablesLimitInr: 'Jewellery and valuables limit (₹)',
    alternateAccommodationInr: 'Rent / alternate accommodation cover (₹)',
    publicLiabilityInr: 'Public liability cover (₹)',
    personalAccidentInr: 'Personal accident cover (₹)',
    deductibleInr: 'Deductible per claim (₹)',
  },
  groups: [
    { title: 'Basic Information', fields: ['insuredName', 'policyNumber', 'insurerName', 'planName', 'policyStartDate', 'policyEndDate', 'policyTermYears'] },
    { title: 'Cover and Premium', fields: ['coverScope', 'sumInsuredStructureInr', 'sumInsuredContentsInr', 'valuationBasis', 'averageClause', 'premiumAmountInr'] },
    { title: 'Perils', fields: ['floodCovered', 'earthquakeCovered', 'burglaryCovered', 'waterDamageCovered'] },
    { title: 'Extras', fields: ['electronicsCovered', 'valuablesCovered', 'valuablesLimitInr', 'alternateAccommodationInr', 'publicLiabilityInr', 'personalAccidentInr'] },
    { title: 'Deductible', fields: ['deductibleInr'] },
  ],
  critical: ['coverScope', 'sumInsuredStructureInr'],
  numeric: new Set(['policyTermYears']),
  boolean: new Set(['averageClause', 'floodCovered', 'earthquakeCovered', 'burglaryCovered', 'waterDamageCovered', 'electronicsCovered', 'valuablesCovered']),
};

const PERSONAL_ACCIDENT: FieldSpec = {
  labels: {
    insuredName: 'Insured person',
    policyNumber: 'Policy Number',
    insurerName: 'Insurer',
    planName: 'Plan Name',
    policyStartDate: 'Start Date',
    policyEndDate: 'Expiry Date',
    coverBasis: 'Who is covered (individual / family floater)',
    coverTerritory: 'Where it covers (worldwide / India only)',
    premiumAmountInr: 'Total Premium (₹)',
    accidentalDeathInr: 'Accidental death benefit (₹)',
    permanentTotalDisabilityInr: 'Permanent total disability benefit (₹)',
    permanentPartialDisabilityCovered: 'Permanent partial disability paid as a share',
    temporaryDisabilityCovered: 'Pay while recovering (temporary disablement)',
    temporaryDisabilityWeeklyInr: 'Weekly recovery benefit (₹)',
    temporaryDisabilityMaxWeeks: 'Recovery benefit paid for up to (weeks)',
    medicalExpensesCovered: 'Accident medical expenses covered',
    medicalExpensesLimitInr: 'Accident medical expenses limit (₹)',
    hospitalCashDailyInr: 'Hospital cash per day (₹)',
    childEducationBenefit: 'Child education benefit',
    loanEmiCover: 'Loan EMI cover',
    ambulanceCover: 'Ambulance charges covered',
  },
  groups: [
    { title: 'Basic Information', fields: ['insuredName', 'policyNumber', 'insurerName', 'planName', 'policyStartDate', 'policyEndDate', 'coverBasis', 'coverTerritory', 'premiumAmountInr'] },
    { title: 'Lump-sum Benefits', fields: ['accidentalDeathInr', 'permanentTotalDisabilityInr', 'permanentPartialDisabilityCovered'] },
    { title: 'While You Recover', fields: ['temporaryDisabilityCovered', 'temporaryDisabilityWeeklyInr', 'temporaryDisabilityMaxWeeks', 'medicalExpensesCovered', 'medicalExpensesLimitInr', 'hospitalCashDailyInr'] },
    { title: 'Extras', fields: ['childEducationBenefit', 'loanEmiCover', 'ambulanceCover'] },
  ],
  critical: ['accidentalDeathInr', 'permanentTotalDisabilityInr'],
  numeric: new Set(['temporaryDisabilityMaxWeeks']),
  boolean: new Set(['permanentPartialDisabilityCovered', 'temporaryDisabilityCovered', 'medicalExpensesCovered', 'childEducationBenefit', 'loanEmiCover', 'ambulanceCover']),
};

export const FIELD_SPECS: Record<PolicyProductType, FieldSpec> = { HEALTH, TERM, SAVINGS, MOTOR, HOME, PERSONAL_ACCIDENT };

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
  SAVINGS: [
    { label: 'Cover and term', category: 'COVERAGE', keys: ['sumAssured', 'policyTermYears', 'ageAtEntry'] },
    { label: 'Premium commitment', category: 'PREMIUM', keys: ['premiumAmountInr', 'premiumPayingTermYears', 'premiumFrequency', 'premiumType'] },
    { label: 'What you get back', category: 'RETURNS', keys: ['maturityBenefitGuaranteedInr', 'maturityBenefitIllustratedInr', 'participating', 'survivalBenefits'] },
    { label: 'Getting money out', category: 'LIQUIDITY', keys: ['guaranteedSurrenderFromYear', 'lockInYears', 'loanAvailable', 'freeSwitchesPerYear'] },
    { label: 'ULIP charges', category: 'CHARGES', keys: ['premiumAllocationChargePct', 'fundManagementChargePct', 'ulipDeathBenefitBasis'] },
    { label: 'Claim terms', category: 'CLAIM_TERMS', keys: ['suicideExclusionMonths', 'gracePeriodDays', 'freeLookDays', 'nomineePresent'] },
    { label: 'Exclusions', category: 'EXCLUSION', keys: ['exclusions'] },
  ],
  PERSONAL_ACCIDENT: [
    { label: 'Policy period', category: 'VALIDITY', keys: ['policyStartDate', 'policyEndDate'] },
    { label: 'Who and where', category: 'COVERAGE', keys: ['coverBasis', 'coverTerritory', 'premiumAmountInr'] },
    { label: 'Lump-sum benefits', category: 'PAYOUT', keys: ['accidentalDeathInr', 'permanentTotalDisabilityInr'] },
    { label: 'Partial disability, recovery and medical', category: 'BENEFIT', keys: ['permanentPartialDisabilityCovered', 'temporaryDisabilityCovered', 'temporaryDisabilityWeeklyInr', 'temporaryDisabilityMaxWeeks', 'medicalExpensesCovered', 'medicalExpensesLimitInr', 'hospitalCashDailyInr', 'childEducationBenefit', 'loanEmiCover', 'ambulanceCover'] },
    { label: 'Exclusions', category: 'EXCLUSION', keys: ['exclusions'] },
  ],
  HOME: [
    { label: 'Policy period', category: 'VALIDITY', keys: ['policyStartDate', 'policyEndDate', 'policyTermYears'] },
    { label: 'Cover and sums insured', category: 'COVERAGE', keys: ['coverScope', 'sumInsuredStructureInr', 'sumInsuredContentsInr', 'averageClause', 'floodCovered', 'earthquakeCovered', 'burglaryCovered', 'waterDamageCovered', 'premiumAmountInr'] },
    { label: 'How claims are paid', category: 'CLAIM_TERMS', keys: ['valuationBasis'] },
    { label: 'Extras', category: 'BENEFIT', keys: ['electronicsCovered', 'valuablesCovered', 'valuablesLimitInr', 'alternateAccommodationInr', 'publicLiabilityInr', 'personalAccidentInr'] },
    { label: 'Deductible', category: 'DEDUCTIBLE', keys: ['deductibleInr'] },
    { label: 'Exclusions', category: 'EXCLUSION', keys: ['exclusions'] },
  ],
  MOTOR: [
    { label: 'Policy period', category: 'VALIDITY', keys: ['policyStartDate', 'policyEndDate'] },
    { label: 'Cover', category: 'COVERAGE', keys: ['policyKind', 'idvInr', 'premiumAmountInr'] },
    { label: 'No-claim bonus', category: 'NCB', keys: ['ncbPercent', 'ncbProtect'] },
    { label: 'Add-ons and accident cover', category: 'BENEFIT', keys: ['zeroDepreciation', 'engineProtect', 'returnToInvoice', 'consumablesCover', 'roadsideAssistance', 'tyreProtect', 'keyReplacement', 'ownerDriverPaInr', 'passengerPaInr'] },
    { label: 'Deductibles', category: 'DEDUCTIBLE', keys: ['compulsoryDeductibleInr', 'voluntaryDeductibleInr'] },
    { label: 'Exclusions', category: 'EXCLUSION', keys: ['exclusions'] },
  ],
};
