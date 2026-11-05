import { describe, it, expect } from 'vitest';
import type { SpendCategory } from '@everypaisa/shared';
import { categorise, merchantCategory, payeeKey, ruleCategory, type CategoriseInput } from './categorise.js';

const debit = (counterparty: string | null, narration: string | null = null, eventType: string | null = 'UPI_DEBIT'): CategoriseInput => ({
  direction: 'DEBIT', eventType, counterparty, narration, excludeReason: null,
});
const credit = (counterparty: string, narration: string | null = null): CategoriseInput => ({
  direction: 'CREDIT', eventType: 'NEFT_CREDIT', counterparty, narration, excludeReason: null,
});
const none = new Map<string, SpendCategory>();
const cat = (i: CategoriseInput) => categorise(i, none, none);

describe('payeeKey', () => {
  it('keeps a UPI handle, otherwise a cleaned name', () => {
    expect(payeeKey('PAYTMQR2810@paytm', null)).toBe('paytmqr2810@paytm');
    expect(payeeKey('SWIGGY LTD', null)).toBe('swiggy');
    expect(payeeKey('Swiggy', null)).toBe('swiggy');
    expect(payeeKey('UPI-SHARMA GENERAL STORE-1234', null)).toBe('sharma general store');
    expect(payeeKey(null, 'NEFT to Brightline Media LLP')).toBe('brightline media');
    expect(payeeKey(null, null)).toBeNull();
  });
});

describe('rules', () => {
  it('sorts credits into income, refund or investment, never spending', () => {
    expect(ruleCategory(credit('Brightline Media LLP', 'salary'))).toBe('income');
    expect(ruleCategory(credit('AMAZON PAY', 'Refund for order 402'))).toBe('refund');
    expect(ruleCategory(credit('ICCL', 'MF redemption'))).toBe('investment');
  });

  it('uses the event type for EMIs, SIPs, card bills and rent', () => {
    expect(ruleCategory(debit('HDFC BANK', null, 'EMI_DEBIT'))).toBe('loan_emi');
    expect(ruleCategory(debit('BSE', null, 'SIP_INSTALLMENT'))).toBe('investment');
    expect(ruleCategory(debit('HDFC CC', null, 'CARD_PAYMENT'))).toBe('credit_card_bill');
    expect(ruleCategory(debit('Mr Kulkarni', null, 'RENT_PAID'))).toBe('rent');
  });

  it('reads ATM, card bills, EMIs, investing, tax and life cover from the text', () => {
    expect(ruleCategory(debit(null, 'ATM WDL MG ROAD'))).toBe('cash_withdrawal');
    expect(ruleCategory(debit('CRED CLUB'))).toBe('credit_card_bill');
    expect(ruleCategory(debit('BAJAJ FINANCE LTD'))).toBe('loan_emi');
    expect(ruleCategory(debit('ZERODHA BROKING'))).toBe('investment');
    expect(ruleCategory(debit(null, 'Advance tax challan 280'))).toBe('tax');
    expect(ruleCategory(debit('LIC OF INDIA'))).toBe('insurance_premium_life');
    expect(ruleCategory(debit('NIVA BUPA HEALTH'))).toBe('healthcare');
    expect(ruleCategory(debit(null, 'House rent October'))).toBe('rent');
  });

  it('does not read street abbreviations or longer words as rules', () => {
    expect(ruleCategory(debit('CAFE MG RD'))).toBeNull();
    expect(ruleCategory(debit('CURRENT AFFAIRS BOOKS'))).toBeNull();
    expect(ruleCategory(debit('CREDITLINE STORES'))).toBeNull();
  });

  it('a self transfer stays a self transfer', () => {
    expect(ruleCategory({ ...debit('RAHUL V SHARMA'), excludeReason: 'self_transfer' })).toBe('self_transfer');
  });
});

describe('merchant list', () => {
  it('knows common merchants, longest name first', () => {
    expect(merchantCategory(' swiggy instamart order ')).toBe('groceries');
    expect(merchantCategory(' swiggy ')).toBe('dining_out');
    expect(merchantCategory(' bigbasket ')).toBe('groceries');
    expect(merchantCategory(' indian oil petrol pump ')).toBe('fuel_transport');
    expect(merchantCategory(' netflix com ')).toBe('lifestyle');
    expect(merchantCategory(' tata 1mg ')).toBe('healthcare');
    expect(merchantCategory(' amazon ')).toBe('other_consumption');
  });

  it('matches whole words only', () => {
    expect(merchantCategory(' coca cola ')).toBeNull(); // not "ola"
    expect(merchantCategory(' ramesh kumar ')).toBeNull();
  });
});

describe('categorise order', () => {
  it("the user's tag beats rules and the merchant list", () => {
    const user = new Map<string, SpendCategory>([['swiggy', 'groceries']]);
    expect(categorise(debit('SWIGGY'), user, none)).toEqual({ category: 'groceries', source: 'user' });
  });

  it('rules beat the merchant list, which beats an AI tag', () => {
    expect(cat(debit('AMAZON PAY', 'credit card bill payment'))).toEqual({ category: 'credit_card_bill', source: 'rule' });
    const model = new Map<string, SpendCategory>([['swiggy', 'household']]);
    expect(categorise(debit('SWIGGY'), none, model)).toEqual({ category: 'dining_out', source: 'dictionary' });
  });

  it('falls back to an AI tag, then to uncategorised', () => {
    const model = new Map<string, SpendCategory>([['sharma general store', 'groceries']]);
    expect(categorise(debit('SHARMA GENERAL STORE'), none, model)).toEqual({ category: 'groceries', source: 'model' });
    expect(cat(debit('RAMESH KUMAR'))).toEqual({ category: 'uncategorised', source: 'none' });
  });
});
