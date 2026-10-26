[Index](../INDEX.md)

# Professional workspace (Client books)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

The professional workspace lets an accountant, CA or adviser open the books of people who have given them access. It has two halves: the account holder decides who can see their books and what they may change (sidebar **Account Access**, documented in the account-access chapter, [D-CA-001](../dependencies.md#d-ca-001)); the professional works in **Client books** (`/ca`). Acting for someone who invited you is free on any plan. Inviting clients of your own needs the Pro/Advisor plan. Every page in the workspace needs two-factor sign-in that is switched on and was used for the current session.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-CA-001](../features/F-CA-001.md) | Client books entry and two-factor gate | Live | Adds Client books to the sidebar (next to Account Access) once you hold at least one client relationship, and guards /ca and … |
| [F-CA-002](../features/F-CA-002.md) | Clients list | Live | The Clients page (eyebrow "Practice") lists the people whose books you keep in three groups: Your clients (active; each card shows name, … |
| [F-CA-003](../features/F-CA-003.md) | Close an engagement | Live | Ends your access to one client's books from your side. |
| [F-CA-004](../features/F-CA-004.md) | Invite a client (practice) | Live | A Pro/Advisor practice invites someone to share their books. |
| [F-CA-005](../features/F-CA-005.md) | Accept a practice's invitation (account holder) | Live | The page Give your accountant access explains what accepting grants and lets you Accept or choose Not now. |
| [F-CA-006](../features/F-CA-006.md) | Accept an account holder's invitation (professional) | Live | When an account holder invites their professional from Account Access, the emailed link opens a page — viewable before signing in — titled … |
| [F-CA-007](../features/F-CA-007.md) | Client books header and live access changes | Live | At the top of /ca/clients/:id: All clients back link, the client's name and email, a badge (Keep the books / Make some changes / View … |
| [F-CA-008](../features/F-CA-008.md) | Chart of accounts | Live | The Chart of accounts tab lists the client's ledger heads (Code, Account, Type). |
| [F-CA-009](../features/F-CA-009.md) | Vouchers and receipts | Live | The Vouchers tab lists double-entry vouchers (No., Type, Date, Narration). |
| [F-CA-010](../features/F-CA-010.md) | Generate from activity | Live | Derives vouchers from what the client recorded (trades, loan payments, rent, premiums). |
| [F-CA-011](../features/F-CA-011.md) | Trial balance | Live | Shows every account's Opening, Debit, Credit and Balance, with a Total row and a badge "Debits and credits agree" or "Out of balance by ₹…". |
| [F-CA-012](../features/F-CA-012.md) | Client transactions | Live | The Transactions tab lists the client's trades (Date, Asset, Type, Qty, Price, Net). |
| [F-CA-013](../features/F-CA-013.md) | Import a statement for a client | Live | Import file uploads a statement, contract note or CAS into the client's books and parses it in the background ("File uploaded — parsing in … |
| [F-CA-014](../features/F-CA-014.md) | Fair market value on 31 Jan 2018 | Live | The FMV (31 Jan 2018) tab lists per-scrip values used to grandfather long-term equity gains under Section 55(2)(ac) (ISIN, Scrip, Source — … |
| [F-CA-015](../features/F-CA-015.md) | Client reports | Live | The Reports tab runs the app's report catalogue (D-CA-003) against the client's data. |
| [F-CA-016](../features/F-CA-016.md) | Client documents | Live | The Documents tab lists files the client attached to properties, vehicles, policies and portfolios (name, owner type, category, size, date). |
| [F-CA-017](../features/F-CA-017.md) | Client activity | Live | The Activity tab, Everything you have done here, is a day-grouped timeline of your changes to this client's books (and access events), each … |

Settings for this module: [settings/professional-workspace-client-books.md](../settings/professional-workspace-client-books.md)
