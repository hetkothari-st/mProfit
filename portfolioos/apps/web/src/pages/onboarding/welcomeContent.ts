import {
  Boxes,
  CalendarClock,
  FileDown,
  Landmark,
  LineChart,
  Users,
  type LucideIcon,
} from 'lucide-react';

/**
 * What a new account is shown before it is asked for anything.
 *
 * Three panels: what this is for, what it does, and what happens to what you
 * put in it. All of it skippable — somebody who wants to get on with entering
 * their FDs should not have to read a brochure first.
 *
 * The lines are ours. No borrowed quotations: a wall of Buffett makes a
 * personal-finance app sound like every other personal-finance app, and the
 * things worth saying here are specific to what this one actually does.
 */

export interface WelcomeFeature {
  icon: LucideIcon;
  title: string;
  body: string;
}

export const WELCOME_FEATURES: WelcomeFeature[] = [
  {
    icon: Boxes,
    title: 'All of it, in one place',
    body: 'Stocks, funds, FDs, gold, property, insurance, loans, even the car. A net worth that leaves nothing out is the only one worth reading.',
  },
  {
    icon: LineChart,
    title: 'Returns you can defend',
    body: 'XIRR per holding and per portfolio, FIFO capital gains, grandfathered costs for anything bought before 2018. The number and the arithmetic behind it.',
  },
  {
    icon: FileDown,
    title: 'Your statements do the typing',
    body: 'Drop in a CAS or a contract note and the transactions come out the other side — matched, dated and priced, with anything unreadable held back for you to check.',
  },
  {
    icon: Users,
    title: 'The whole household',
    body: 'Parents and grandparents without an email of their own can still have their books kept — by you, properly, until the day they want to take them over.',
  },
  {
    icon: CalendarClock,
    title: 'Nothing lapses quietly',
    body: 'Premiums, FD maturities, PUC and insurance expiry, rent that has not arrived. The things that cost money by being forgotten.',
  },
  {
    icon: Landmark,
    title: 'Ready for the return',
    body: 'Schedule 112A, realised gains by financial year, rental income and interest, in the form your CA is expecting.',
  },
];

/**
 * Lines shown one at a time while the account is set up. Written to be read
 * once and remembered, not to fill space — an onboarding screen is a bad
 * place to be clever at the reader's expense.
 */
export const WELCOME_LINES: string[] = [
  'Wealth is quiet. It is the fixed deposit nobody mentions at dinner.',
  'You cannot compound what you cannot count.',
  'The expensive mistakes are rarely dramatic. They are the policy that lapsed and the folio nobody opened.',
  'Every number here traces back to something you entered or a statement you uploaded. Nothing is guessed.',
  'A portfolio is a household, not a login.',
];
