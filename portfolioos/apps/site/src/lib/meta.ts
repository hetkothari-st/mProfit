export interface PageMeta {
  path: string;
  title: string;
  description: string;
}

export const pages: PageMeta[] = [
  {
    path: '/',
    title: 'EveryPaisa — Every paisa, in one honest ledger',
    description:
      "EveryPaisa keeps your family's money in one ledger: stocks, mutual funds, FDs, PF, gold, property, vehicles, insurance and loans. It reads your bank and broker alerts, works out your capital gains, and shows your real net worth.",
  },
  {
    path: '/features',
    title: 'Features — EveryPaisa',
    description:
      'Everything EveryPaisa does: inbox and statement imports, 19 asset classes, mutual fund research, capital gains and Schedule 112A, insurance, vehicles, rentals, loans, family and CA accounting.',
  },
  {
    path: '/pricing',
    title: 'Pricing — EveryPaisa',
    description: 'Free for your own money. Plus, Family and Pro / Adviser plans for automation, households and CA practices.',
  },
  {
    path: '/security',
    title: 'Privacy & security — EveryPaisa',
    description: 'How EveryPaisa protects your financial data: read-only access, encryption at rest, per-user isolation, identifiers removed before AI parsing and two-factor sign-in.',
  },
  {
    path: '/contact',
    title: 'Contact — EveryPaisa',
    description: 'Write to the EveryPaisa team about your account, CA and adviser partnerships, press or a security report.',
  },
];

export const notFoundMeta: PageMeta = {
  path: '/404',
  title: 'Page not found — EveryPaisa',
  description: 'This page does not exist.',
};

export const metaFor = (path: string): PageMeta =>
  pages.find((p) => p.path === (path.replace(/\/+$/, '') || '/')) ?? notFoundMeta;
