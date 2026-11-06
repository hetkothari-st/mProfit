# Plan: Personal Inflation from real spending (no Finvu yet)

Date: 2026-11-05 · Status: **decisions made 2026-11-05, ready to build** · Reference: `PERSONAL_INFLATION_SPEC.md` (product spec, written without codebase knowledge)

## Goal

Build the spec's pipeline so the personal inflation rate (PIR) comes from what the user actually spends, not only from expenses typed in by hand:

```
sources → normalised spend transactions → categoriser → recurring detector
        → monthly category spend (kept) → PIR engine → goal impact → UI
```

**Constraints:**
- Every source emits the same normalised row, so Finvu (Account Aggregator) plugs in later as one more adapter with nothing downstream changing. The spec's own acceptance test: a mock Finvu source gives the same PIR.
- No paid data sources now. Parsing should cost little or nothing: deterministic parsers first, the LLM only as a fallback.

## What exists today (and what's missing)

| Piece | Today | Gap |
|---|---|---|
| Bank alert emails | Gmail poller → LLM → `CanonicalEvent` (UPI/NEFT/card debits and credits), oldest-first backfill (#331) | Each new alert format costs LLM calls until learned templates take over (10 samples per template, `ingestion/templates.ts`). No category. |
| Statement PDFs in Gmail | Whole-inbox fetch (#320) finds `BANK_STATEMENT` / `CC_STATEMENT` attachments | Not turned into spend rows |
| Uploaded bank statement | `bankStatement.parser.ts`: PDF only, LLM, **only the first 8,000 characters read** (a long statement loses most rows); rows become cash `Transaction`s | No CSV/XLS, no card line items, no category |
| Credit cards | `CreditCardStatement` stores the bill total only | No line items, so card spending can't be categorised and card bills risk double counting |
| PDF passwords | Tried from PAN/DOB/phone (`lib/pdf.ts`), never stored | Matches the spec (§13) |
| Categories | None for spending | Whole categoriser missing |
| Safe to Invest | Has its own credit classifier and "everyday spend" filter over `CanonicalEvent` | Should read the same cleaned store |

## Free sources, in order of value

1. **Bank and card alert emails** (already flowing): near real-time, but alerts can be missing (not every bank emails every UPI payment).
2. **Monthly e-statement PDFs in Gmail.** Banks and card issuers email them, usually with a PAN/DOB password we can already try. This is the most complete free source: the full ledger, including card line items.
3. **Uploads:** PDF, CSV and XLS statements from net banking.
4. **Manual expenses:** the current basket stays for things no statement shows (cash rent, school fees paid by cheque).
5. **Later: Finvu** `DEPOSIT` transactions, as one more adapter.

**SMS: not planned.** The web app can't read SMS. On Android, Google Play only allows SMS read access for default SMS apps, so a finance app can't rely on it. A "paste an SMS" box is possible but low value.

## Data model (new tables, all user-scoped with RLS)

- `SpendTxn`: one normalised row per bank or card movement.
  - Fields: `userId`, `accountKey` (bank last4 / card last4), `source` (gmail_alert | gmail_statement | upload | manual | finvu), `sourceRef`, `txnDate`, `amount` (positive), `direction`, `mode`, `narration`, `counterparty`, `category`, `categorySrc` (rule | dictionary | model | user), `excluded` + `excludeReason`, `seriesId`, `dedupeHash` (unique per user).
  - Alert and statement rows for the same payment are matched on account + amount + date within ±1 day, and kept once: the statement wins.
- `MerchantCategory`: counterparty or UPI handle → category. Seeded globally, with per-user overrides that always win.
- `RecurringSeries`: counterparty, category, cadence, first/last seen, `isFixed`.
- `MonthlyCategorySpend` (the kept derived store): `userId`, `month`, `category`, `amount`. The PIR engine reads only this table plus the recurring series.
- `PirSnapshot`: `asOf`, `pir`, `cpiHeadline`, `confidence`, `state`, `detail` JSON. One row per month plus one on each new upload.
- Category → CPI division map in `AppSetting` (editable, not code). The spec's categories map onto our 12 MoSPI 2024 divisions; this is close to 1:1, see the table below.

Raw statement files are deleted after parsing, keeping only the derived tables (spec: at most 30 days). Gmail-scan staging documents currently stay on disk; that's covered here too.

## Category map (spec → our CPI divisions)

| Spec category | Division |
|---|---|
| groceries | 01 Food & beverages |
| dining_out | 11 Restaurants & accommodation |
| rent, utilities | 04 Housing, water, electricity, gas |
| fuel_transport | 07 Transport |
| phone_internet | 08 Information & communication |
| education | 10 Education |
| healthcare | 06 Health |
| clothing | 03 Clothing & footwear |
| household, domestic_help | 05 Household goods & help |
| personal_care | 13 Personal care & misc. |
| lifestyle | 09 Recreation |
| other_consumption | 00 Headline |

**Excluded:** self transfer, investment, loan EMI, card bill, tax, life premium, refund, cash withdrawal, income.

## Work, as separate PRs

1. **Normalised store + adapters for what we already have.**
   - Add `SpendTxn` and the source-adapter interface.
   - Gmail-alert adapter (from `CanonicalEvent`), manual adapter.
   - Dedupe and self-transfer detection, reusing Safe to Invest's name rule.
   - Backfill from existing events.
   - Exit: re-running gives zero new rows.
2. **Free deterministic parsing.**
   - Rule parsers for the top bank alert formats (HDFC, ICICI, SBI, Axis, Kotak) and for statement layouts. The LLM is used only when no parser matches.
   - Fix the 8,000-character cutoff: the parser path reads the whole file; the LLM fallback works page by page.
   - Add CSV and XLS uploads.
   - Exit: golden tests with at least 5 anonymised real fixtures per parser (CLAUDE.md §3.9).
3. **Card statements.**
   - Parse e-mailed and uploaded card statements into line items.
   - When line items exist, exclude the card-bill debit from the bank side (no double counting). With no card statement, count the bill as other consumption and lower confidence by 0.1 (spec §8).
4. **Categoriser.**
   - Order: user override → rules (ATM, NACH + AMC, own accounts, EMI/SIP keywords) → merchant dictionary → optional LLM fallback.
   - Ask the user to tag the top 5 uncategorised payees by amount. Corrections feed the dictionary.
5. **Recurring detector + monthly aggregation job.**
   - Recurring: ±10% amount, ±5 days, at least 3 occurrences.
   - Refunds netted against their category; one-offs over 3× the category's monthly median set aside.
   - Match manual expenses to recurring bank payments (decision 1) and set matches aside, unless the user switches them back on.
   - Runs monthly and after each new upload.
6. **PIR engine v2 (pure functions).**
   - 12-month weights.
   - Own-price rate for fixed series seen in both the current and previous 12 months.
   - Blended with CPI by α (the share of each category's spend covered by those series).
   - Step-change rule: above +25% or below −10%, use CPI and ask "did you move or change school?".
   - Confidence = months/12 × categorised share × account coverage.
   - States: ready / building / low_confidence, with the PIR hidden below 0.6.
   - Exit: the spec §7 vector and all of §12's acceptance tests.
7. **UI.**
   - "Building your picture" state listing what's missing.
   - A source chip on each category.
   - The tagging prompt.
   - A consent notice at upload.
   - Manual expenses: same add/edit/delete as today, shown next to the bank figures (see "Manual expenses" below).
8. **Safe to Invest switch-over.** Its inflows and its spending buffer read the same `SpendTxn` store, so both pages agree.
9. **Raw-file purge job**, plus purging Gmail staging documents after parsing.
10. **Finvu adapter (later, once partnered).** Map `DEPOSIT` transactions to `SpendTxn`, then run the mock-Finvu equivalence test.

PRs 1, 4, 5 and 6 are the core; 2 and 3 widen coverage; 7 can ship with 6.

## Decisions (made 2026-11-05)

1. **Statements and manual expenses work side by side.**
   - Statements and alerts feed the basket automatically, with no action needed.
   - Manual expenses can still be added, edited and deleted as today, and are **never changed or removed by the app**. Only the user deletes them.
   - To avoid counting the same spending twice, the bank figure wins at the level of the individual payment, not the whole category. A manual item is set aside only when a recurring bank payment matches it: same category, amount within ±10%, same frequency. Example: a typed "Rent ₹25,000" with a ₹25,000 monthly transfer to the landlord.
   - A set-aside item stays on the page, labelled "Already in your bank data", with a switch to count it anyway. Anything the bank doesn't show (cash rent, fees paid by cheque) always counts.
2. **AI stays as the fallback** for formats no parser reads, within the existing ₹1,000/month cap. The first backfill counts against the cap, as it does today.
3. **CPI figure:** the 5-year average for rates and projections, with the latest 12-month change shown next to it (live since #333).
4. **Consent wording:** drafted below, for legal review before launch.
5. **Healthcare goals:** done in #333.
6. **Low confidence never hides a rate the user already has.** Below confidence 0.6 the page keeps today's rate from manual entries, with a note such as "Bank data: 4 of 12 months, using what you've added for now". It switches to the bank-based rate once confidence reaches 0.6. With no manual entries and low confidence, it shows "building your picture" (spec §6.4).
7. **What changes for users:** PRs 1–5 change nothing on screen. PR 6 changes the rate only for users whose bank data reaches the confidence bar. Goals change only on "Re-plan". Safe to Invest changes only in PR 8.

## Consent notice (draft, needs legal review)

Shown once, before the first statement upload or before alert emails are first used for spending. The user must tick to continue. Stored as an `AuditLog` row (`action = "consent.spending_analysis"`, with the notice version) so it can be proven later.

> **Use your bank statements to work out your own inflation**
>
> To show how fast *your* costs are rising, EveryPaisa reads the transactions in
> the bank and credit-card statements you upload, and in the bank alert emails
> from senders you've chosen in Email ingestion.
>
> **What we use:** date, amount, payee and description of each transaction.
> We use them only to sort your spending into categories, work out your
> personal inflation rate and Safe to Invest amount, and plan your goals.
>
> **What we keep:** the categorised transactions and monthly totals, until you
> delete them or your account. Uploaded files are deleted as soon as they are
> read (within 30 days at most). A statement password is kept only if you choose to save it, and is stored encrypted.
>
> **Automated reading:** some statements and emails are read by an AI model
> (Anthropic), with your name, PAN, account and card numbers masked first. The
> provider does not keep or train on this data.
>
> **Your choices:** you can turn this off, correct any category, or delete
> your spending data at any time in Settings → Privacy. Turning it off stops
> new reading; deleting removes what we hold. Questions or complaints:
> [grievance officer name, email] under the Digital Personal Data Protection
> Act, 2023.
>
> ☐ I agree to EveryPaisa using my statements and bank alert emails for these purposes.

**Placeholders for you:**
- The grievance officer's name and email.
- Whether the Anthropic zero-retention claim is confirmed for your account. `warnIfZeroRetentionUnconfirmed` currently warns that it isn't. If it can't be confirmed, drop the "does not keep" sentence.

## Risks

- **Alert coverage varies by bank.** Some banks don't email small UPI payments, so e-statements matter more than alerts. Confidence will show the gap.
- **The merchant dictionary starts small.** Expect many uncategorised payees early; the top-5 prompt and user corrections close this.
- **Statement layouts change.** Parsers are versioned (CLAUDE.md §3.4) and fall back to the LLM path.
