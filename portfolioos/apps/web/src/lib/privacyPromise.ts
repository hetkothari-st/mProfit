/**
 * What we tell people about where their financial life is kept.
 *
 * ── Read this before changing STORAGE_MODE ────────────────────────
 * This is the one claim in the product that must never run ahead of the
 * architecture. "It stays on your device" is a promise about where the bytes
 * are, and a person deciding whether to type in their PAN, their policy
 * numbers and their net worth is entitled to take it literally.
 *
 * Today the app is a hosted service: holdings, transactions and documents are
 * in Postgres, encrypted at rest and fenced off per account by row-level
 * security, and statements are parsed on the server. That is what the
 * `hosted` copy below describes, and it is true.
 *
 * The plan is local-first: the ledger lives in the browser's own storage, the
 * server holds nothing but what is needed to sign in and sync between the
 * person's own devices. The copy for that is written and waiting — flip
 * STORAGE_MODE to 'device' on the day the data actually moves, not before.
 * Shipping the device wording while rows are still in Postgres would be a
 * false statement to every account that reads it, in a product about money.
 */

export type StorageMode = 'hosted' | 'device';

/**
 * Flip to 'device' when the local-first store ships. See the note above.
 *
 * Widened on purpose: the whole point is that this one value changes, and a
 * literal type would make the code that reads it look unreachable.
 */
export const STORAGE_MODE = 'hosted' as StorageMode;

export interface PrivacyPromise {
  /** The headline claim. */
  headline: string;
  /** One paragraph under it. */
  body: string;
  /** The specific commitments, each one checkable. */
  points: string[];
  /** The line that closes the panel. */
  footer: string;
}

const HOSTED: PrivacyPromise = {
  headline: 'Your money is your business',
  body: 'Everything you record here is yours. We hold it so that it is there on every device you sign in from — and we hold it the way money ought to be held.',
  points: [
    'Encrypted in transit and at rest. PAN, policy numbers and account numbers are encrypted again, column by column.',
    'Fenced off per account at the database itself, not merely in our code — one account cannot read another’s rows even if we make a mistake.',
    'Never sold, never rented, never used to sell you anything. There are no advertisers here, and no data brokers.',
    'Read-only where we connect to anything of yours, and only the senders you choose. We never scan an inbox.',
    'Yours to take and yours to end: export everything whenever you like, and delete the account outright — which deletes the data, not just the login.',
  ],
  footer:
    'We are moving to keeping your ledger on your own device. Until that ships, this is exactly what happens to it.',
};

const DEVICE: PrivacyPromise = {
  headline: 'It stays on your device',
  body: 'Your holdings, transactions and documents are kept in this device’s own storage. They are not uploaded to us, and there is no copy of your portfolio on our servers to lose, subpoena or sell.',
  points: [
    'Your ledger never leaves the device unless you ask it to — no silent upload, no background copy.',
    'We hold only what signing in requires. We could not read your portfolio if we wanted to.',
    'Nothing is sold, rented, or used to sell you anything. There are no advertisers here and no data brokers.',
    'Syncing between your own devices is end-to-end encrypted, and off until you turn it on.',
    'Export it any time, in a format you can open without us. Delete it and it is gone from the device — nothing of it is left behind with us.',
  ],
  footer: 'A record of your money should answer to you alone. We built it so that it does.',
};

export const PRIVACY_PROMISE: PrivacyPromise = STORAGE_MODE === 'device' ? DEVICE : HOSTED;

/** The short version, for the sign-up screen and the footer. */
export const PRIVACY_ONE_LINER =
  STORAGE_MODE === 'device'
    ? 'Your financial data stays on your device. We never see it.'
    : 'Encrypted, never sold, and yours to export or delete at any time.';
