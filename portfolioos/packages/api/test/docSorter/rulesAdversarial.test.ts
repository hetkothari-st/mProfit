import { describe, it, expect } from 'vitest';
import { runRules } from '../../src/services/documents/docSorter/rules.js';

const NOW = new Date('2026-10-14');

/** Layouts that real documents have and the golden fixtures did not: other "… Name" lines before the holder. */
describe('runRules: picks the document holder, not any line containing "name"', () => {
  it('ignores the Form 16 employer/employee header row', () => {
    const r = runRules('FORM NO. 16 Part A\nCertificate under section 203\nName and address of the Employer     Name and address of the Employee\nAssessment Year 2025-26', NOW);
    expect(r.docType).toBe('FORM_16');
    expect(r.personName).toBeNull();
  });
  it('skips a branch name above the account holder', () => {
    const r = runRules('HDFC BANK\nAccount Statement\nBranch Name : Andheri East\nAccount Holder: Priya Mehta\nWithdrawal Deposit Balance', NOW);
    expect(r.personName).toBe('Priya Mehta');
  });
  it('skips a nominee name above the customer name', () => {
    const r = runRules('Bank Statement\nNominee Name: Kavita Mehta\nCustomer Name: Priya Mehta\nWithdrawal Deposit Balance', NOW);
    expect(r.personName).toBe('Priya Mehta');
  });
  it('skips the insurer name above the policy holder', () => {
    const r = runRules('Premium Receipt\nName of the Insurer: Star Health\nPolicy Holder: Raj Patel\nSum Assured', NOW);
    expect(r.personName).toBe('Raj Patel');
  });
  it("skips a father's name", () => {
    const r = runRules("Income Tax Return ITR-V\nFather's Name: Mohan Lal\nName: Raj Lal\nAssessment Year 2025-26", NOW);
    expect(r.personName).toBe('Raj Lal');
  });
  it('rejects filler words and single-word results rather than filing under them', () => {
    expect(runRules('Bank Statement\nName: and\nWithdrawal Deposit', NOW).personName).toBeNull();
    expect(runRules('Bank Statement\nAccount Holder: Kumar\nWithdrawal Deposit', NOW).personName).toBeNull();
  });
});

describe('runRules: PAN last-4 comes from the holder, never the deductor', () => {
  it('takes the employee PAN on a Form 16', () => {
    const r = runRules('FORM NO. 16\nPAN of the Deductor: ABCDE1234F\nTAN of the Deductor: MUMA12345B\nPAN of the Employee: PQRST5678K\nEmployee Name: Rahul Sharma', NOW);
    expect(r.panLast4).toBe('678K');
  });
  it('uses a lone unlabelled PAN, but not one of several unlabelled', () => {
    expect(runRules('Bank Statement\nAccount Holder: Priya Mehta\nPAN XXXXX1234F\nWithdrawal Deposit', NOW).panLast4).toBe('234F');
    expect(runRules('Bank Statement\nAbout ABCDE1234F and also PQRST5678K\nWithdrawal Deposit', NOW).panLast4).toBeNull();
  });
});

describe('runRules: dates', () => {
  it('rejects a date that does not exist instead of letting it roll over', () => {
    expect(runRules('Bank Statement\nStatement Date 31/02/2025\nWithdrawal Deposit', NOW).docDate).toBeNull();
  });
});
