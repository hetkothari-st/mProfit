import {
  Car,
  CreditCard,
  Gem,
  Landmark,
  LineChart,
  PiggyBank,
  ShieldCheck,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

/**
 * What a new account can add during onboarding. Every item writes a real
 * record through an existing API, so the dashboard has numbers to show the
 * moment the flow ends.
 *
 * Property is deliberately absent: the dashboard's net worth reads rental
 * properties only, so a Real Estate entry made here would not show up there.
 */
export type OnboardingItemId =
  | 'mutualFunds'
  | 'stocks'
  | 'fixedDeposits'
  | 'retirement'
  | 'gold'
  | 'vehicles'
  | 'loans'
  | 'creditCards'
  | 'insurance';

export interface OnboardingItem {
  id: OnboardingItemId;
  label: string;
  /** Shown under the heading of this item's quick-add step. */
  prompt: string;
  icon: LucideIcon;
}

export const ONBOARDING_GROUPS: Array<{ heading: string; items: OnboardingItem[] }> = [
  {
    heading: 'Savings & investments',
    items: [
      {
        id: 'mutualFunds',
        label: 'Mutual funds',
        prompt: 'Add each fund with roughly how much you have invested.',
        icon: TrendingUp,
      },
      {
        id: 'stocks',
        label: 'Stocks',
        prompt: 'Add the shares you hold and your average buy price.',
        icon: LineChart,
      },
      {
        id: 'fixedDeposits',
        label: 'Fixed deposits',
        prompt: 'Add each FD with its amount and maturity date.',
        icon: Landmark,
      },
      {
        id: 'retirement',
        label: 'PPF / EPF / NPS',
        prompt: 'Enter the current balance of each account.',
        icon: PiggyBank,
      },
    ],
  },
  {
    heading: 'Physical assets',
    items: [
      { id: 'gold', label: 'Gold', prompt: 'Add the gold you own by weight.', icon: Gem },
      {
        id: 'vehicles',
        label: 'Vehicles',
        prompt: 'Add each vehicle and roughly what it is worth today.',
        icon: Car,
      },
    ],
  },
  {
    heading: 'Loans & cards',
    items: [
      {
        id: 'loans',
        label: 'Loans',
        prompt: 'Add each loan with what you still owe and your EMI.',
        icon: Wallet,
      },
      {
        id: 'creditCards',
        label: 'Credit cards',
        prompt: 'Add each card and the amount currently due.',
        icon: CreditCard,
      },
    ],
  },
  {
    heading: 'Protection',
    items: [
      {
        id: 'insurance',
        label: 'Insurance',
        prompt: 'Add each policy with its cover and yearly premium.',
        icon: ShieldCheck,
      },
    ],
  },
];

export const ONBOARDING_ITEMS: OnboardingItem[] = ONBOARDING_GROUPS.flatMap((g) => g.items);

export function onboardingItem(id: OnboardingItemId): OnboardingItem {
  return ONBOARDING_ITEMS.find((i) => i.id === id)!;
}
