import type { TransactionType } from '@prisma/client';

/**
 * Which way cash moves for each transaction type, from the investor's side:
 * OUT = money paid into an investment, IN = money received from one, NONE =
 * units change hands with no cash (bonus, split, merger, reinvested dividend).
 * Typed over the whole enum, so a new transaction type fails to compile until
 * it is classified here.
 */
export const CASH_DIRECTION = {
  BUY: 'OUT',
  SIP: 'OUT',
  SWITCH_IN: 'OUT',
  RIGHTS_ISSUE: 'OUT',
  DEPOSIT: 'OUT',
  OPENING_BALANCE: 'OUT',
  SELL: 'IN',
  SWITCH_OUT: 'IN',
  REDEMPTION: 'IN',
  MATURITY: 'IN',
  WITHDRAWAL: 'IN',
  DIVIDEND_PAYOUT: 'IN',
  INTEREST_RECEIVED: 'IN',
  BONUS: 'NONE',
  SPLIT: 'NONE',
  MERGER_IN: 'NONE',
  MERGER_OUT: 'NONE',
  DEMERGER_IN: 'NONE',
  DEMERGER_OUT: 'NONE',
  DIVIDEND_REINVEST: 'NONE',
} as const satisfies Record<TransactionType, 'IN' | 'OUT' | 'NONE'>;

export function cashDirection(type: TransactionType): 'IN' | 'OUT' | 'NONE' {
  return CASH_DIRECTION[type];
}
