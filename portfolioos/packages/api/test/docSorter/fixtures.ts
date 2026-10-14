import type { SortDocType } from '@everypaisa/shared';

/** Anonymised extracted-text snippets: PAN masked, names are made up. */
export interface Fx {
  type: SortDocType;
  text: string;
  name: string | null;
  pan: string | null;
  date: string | null;
}

const core = (type: SortDocType, rows: Array<[string, string | null, string | null, string | null]>): Fx[] =>
  rows.map(([text, name, pan, date]) => ({ type, text, name, pan, date }));

export const FIXTURES: Fx[] = [
  ...core('BANK_STATEMENT', [
    ['HDFC BANK LTD\nAccount Statement\nAccount Holder: Rahul Sharma\nPAN: XXXXX1234F\nStatement Period: 01/01/2026 to 31/03/2026\nOpening Balance Closing Balance Withdrawals Deposits', 'Rahul Sharma', '234F', '2026-03-31'],
    ['STATE BANK OF INDIA\nStatement of Account\nCustomer Name : Mrs. Anita Verma\nAccount No XXXX9876\nPeriod: 01-Apr-2025 To 30-Jun-2025\nDebit Credit Balance', 'Anita Verma', null, '2025-06-30'],
    ['ICICI Bank\nYour account statement\nName: TEST USER\nStatement Date 15/05/2026\nWithdrawal Deposit Balance Narration', 'TEST USER', null, '2026-05-15'],
    ['Axis Bank Statement of account\nAccount Holder Name: Priya Nair\nfrom 01/02/2026 to 28/02/2026\nTxn Date Particulars Debit Credit', 'Priya Nair', null, '2026-02-28'],
    ['Kotak Mahindra Bank\nBank Statement\nCustomer Name: Suresh Iyer\nPAN XXXXX5678K\nAs on 10-Jan-2026\nOpening balance deposits withdrawals', 'Suresh Iyer', '678K', '2026-01-10'],
  ]),
  ...core('ITR', [
    ['INDIAN INCOME TAX RETURN\nITR-V Acknowledgement\nAssessment Year 2025-26\nName: Rahul Sharma\nPAN: XXXXX1234F\nTotal Income', 'Rahul Sharma', '234F', '2025-03-31'],
    ['Income Tax Department\nITR-1 SAHAJ\nAssessment Year 2024-25\nName of the Assessee: Anita Verma\nGross Total Income', 'Anita Verma', null, '2024-03-31'],
    ['ITR-V\nAcknowledgement Number 123456789012345\nAY 2023-24\nName: Priya Nair\nTotal income computed under section 139', 'Priya Nair', null, '2023-03-31'],
    ['Income Tax Return Verification Form ITR-2\nAssessment Year 2025-26\nName of the Assessee Suresh Iyer\nPAN XXXXX5678K', 'Suresh Iyer', '678K', '2025-03-31'],
    ['Computation of Income\nITR-3\nAssessment Year 2022-23\nName: TEST USER\nTotal Income Tax Payable', 'TEST USER', null, '2022-03-31'],
  ]),
  ...core('FORM_16', [
    ['FORM NO. 16\nPart A\nCertificate under section 203 of the Income-tax Act\nName and address of the Employee: Rahul Sharma\nPAN of the Employee XXXXX1234F\nAssessment Year 2025-26', 'Rahul Sharma', '234F', '2025-03-31'],
    ['Form 16 Part B\nDetails of Salary Paid\nEmployee Name: Anita Verma\nTDS deducted Financial Year 2024-25', 'Anita Verma', null, '2025-03-31'],
    ['FORM 16\nTDS certificate\nName of Employee: Priya Nair\nAY 2023-24\nTAN of the Deductor', 'Priya Nair', null, '2023-03-31'],
    ['Form No. 16 Part A\nName of the Employee Suresh Iyer\nAssessment Year 2024-25\nSummary of tax deducted at source', 'Suresh Iyer', null, '2024-03-31'],
    ['FORM 16\nCertificate u/s 203\nEmployee Name: TEST USER\nAssessment Year 2021-22', 'TEST USER', null, '2021-03-31'],
  ]),
  ...core('SALARY_SLIP', [
    ['ACME TECHNOLOGIES\nPayslip for the month of March 2026\nEmployee Name: Rahul Sharma\nBasic HRA Net Pay\nPAN XXXXX1234F', 'Rahul Sharma', '234F', '2026-03-31'],
    ['Salary Slip - February 2026\nName: Anita Verma\nEarnings Deductions Net Salary', 'Anita Verma', null, '2026-02-28'],
    ['PAY SLIP\nMonth: April 2025\nEmployee Name: Priya Nair\nGross Earnings Net Pay Provident Fund', 'Priya Nair', null, '2025-04-30'],
    ['Payslip December 2025\nEmployee Name : Suresh Iyer\nBasic Salary Allowances Total Deductions Net Pay', 'Suresh Iyer', null, '2025-12-31'],
    ['Salary Statement for January 2026\nEmployee Name: TEST USER\nEarnings Deductions Net Pay', 'TEST USER', null, '2026-01-31'],
  ]),
  ...core('INCOME_CERTIFICATE', [
    ['GOVERNMENT OF MAHARASHTRA\nINCOME CERTIFICATE\nThis is to certify that Shri Rahul Sharma has an annual income of Rs. 4,50,000\nDate of Issue: 12/03/2026\nTahsildar', 'Rahul Sharma', null, '2026-03-12'],
    ['Income Certificate\nCertified that Smt. Anita Verma resides at Pune and annual family income is Rs. 3,00,000\nIssued on 05/11/2025\nTehsildar Office', 'Anita Verma', null, '2025-11-05'],
    ['OFFICE OF THE TAHSILDAR\nIncome Certificate\nThis is to certify that Ms. Priya Nair has annual income Rs 2,40,000\nDate: 20-Aug-2025', 'Priya Nair', null, '2025-08-20'],
    ['INCOME CERTIFICATE\nName of Applicant: Suresh Iyer\nAnnual Income Rs. 6,00,000\nDate of Issue 01/01/2026\nIssuing Authority Revenue Department', 'Suresh Iyer', null, '2026-01-01'],
    ['Certificate of Income\nThis is to certify that Mr. TEST USER has annual income Rs 5,00,000\nIssued 14/02/2026 Revenue Department', 'TEST USER', null, '2026-02-14'],
  ]),
  { type: 'CAS', text: 'CAMS Consolidated Account Statement\nInvestor Name: Rahul Sharma\nPAN: XXXXX1234F\nStatement period 01-Apr-2025 To 31-Mar-2026\nFolio No Scheme NAV Units', name: 'Rahul Sharma', pan: '234F', date: '2026-03-31' },
  { type: 'CAS', text: 'NSDL Consolidated Account Statement\nName: Anita Verma\nDemat holdings ISIN Units\nAs on 31-Mar-2026', name: 'Anita Verma', pan: null, date: '2026-03-31' },
  { type: 'CONTRACT_NOTE', text: 'ZERODHA BROKING LTD\nContract Note cum Tax Invoice\nTrade Date 12/03/2026\nClient Name: Priya Nair\nBuy Sell Qty Net Rate STT', name: 'Priya Nair', pan: null, date: '2026-03-12' },
  { type: 'CONTRACT_NOTE', text: 'Contract Note\nTrade Date: 02-Feb-2026\nClient Name Suresh Iyer\nSecurity Quantity Brokerage Exchange Obligation', name: 'Suresh Iyer', pan: null, date: '2026-02-02' },
  { type: 'INSURANCE', text: 'HDFC Life Insurance\nPremium Receipt\nPolicyholder: Rahul Sharma\nPolicy No XXXX1122\nDate of Payment 05/04/2026\nSum Assured', name: 'Rahul Sharma', pan: null, date: '2026-04-05' },
  { type: 'INSURANCE', text: 'Star Health Insurance Policy Schedule\nName of Policyholder: Anita Verma\nPolicy Period 01/06/2025\nSum Insured Premium', name: 'Anita Verma', pan: null, date: '2025-06-01' },
  { type: 'FD_CERTIFICATE', text: 'Fixed Deposit Receipt\nHDFC Bank\nDepositor Name: Suresh Iyer\nMaturity Date 15/03/2027\nDate of Deposit 15/03/2026\nInterest Rate', name: 'Suresh Iyer', pan: null, date: '2026-03-15' },
  { type: 'FD_CERTIFICATE', text: 'Term Deposit Advice\nCustomer Name: Priya Nair\nDeposit Date 10/01/2026\nMaturity Amount Fixed Deposit', name: 'Priya Nair', pan: null, date: '2026-01-10' },
  { type: 'ID_PROOF', text: "INCOME TAX DEPARTMENT\nPermanent Account Number Card\nXXXXX1234F\nName\nRAHUL SHARMA\nFather's Name", name: null, pan: '234F', date: null },
  { type: 'ID_PROOF', text: 'Unique Identification Authority of India\nAadhaar\nXXXX XXXX 4321\nGovernment of India', name: null, pan: null, date: null },
];
