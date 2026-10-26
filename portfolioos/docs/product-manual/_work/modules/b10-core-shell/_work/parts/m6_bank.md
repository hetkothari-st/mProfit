## Bank Accounts

Bank Accounts keeps your savings, current, salary and NRI accounts: bank, branch and IFSC, holder, nominee, linked debit card, balance and balance history. The full account number is optional, stored encrypted, and shown only when you ask. Balances here are not part of the Dashboard's Total Net Worth.

### Bank accounts list <!-- F-BANK-001 -->

**What it does:** The page "Bank Accounts" ("Your savings, current, and salary accounts in one place — branch, IFSC, balance, nominee, and linked debit card details.") shows a summary strip — **Total balance** ("across N active account(s)"), **Active accounts** ("with known balances") and **Inactive** ("dormant or closed") — and a tile per account drawn as a bank building: bank logo or initials, type, nickname, masked account number with an eye, **Available balance** (or the status), and **Holder**. Under each tile: Customer ID, IFSC, Branch, Status, "As of <date>" ("· live" when updated from email) and **Share details**.

**Why it exists:** Inferred from the page text: all bank details in one place, for reference and for sharing when someone needs to pay you.

**Where to find it:** **Asset Classes → Bank Accounts** (route `/bank-accounts`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO — your own accounts only (family view does not add other members' accounts). R-MANAGER sees the managed person's accounts.

**Steps**
1. Hover a tile (on touch screens the buttons are always shown) and use **Edit**, **Delete** or **Open**; or click the tile to open it.
2. Click **Add account** to add one (F-BANK-002).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add account** / **Add first account** | Button | Opens the account dialog | — |
| **Edit** | Icon button | Opens the dialog for this account | Shown on hover (always on touch screens) |
| **Delete** | Icon button | F-BANK-003 | Same |
| **Open** / tile | Link | Opens `/bank-accounts/:id` | — |
| Eye on the account number | Toggle | F-BANK-005 | — |
| **Share details** | Button | F-BANK-006 | — |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No bank accounts yet — Add your first bank account to see balances, branch details, and linked transactions." | None added | **Add first account** |

**Limitations:** **Total balance** adds the balances of ACTIVE accounts only; "Active accounts" counts all active accounts whether or not a balance is known. Accounts are ordered by status (Active, then Closed, then Dormant), then bank name, then newest. Balances are hidden by **Hide values**.

**How it works:** `GET /api/bank-accounts` returns your accounts with their latest balance record; the full account number is never sent, only whether one is saved.

**Related features:** F-BANK-002 to F-BANK-008.

**Sources:** `apps/web/src/pages/bankAccounts/BankAccountListPage.tsx:29`, `apps/web/src/pages/bankAccounts/BankAccountListPage.tsx:73`, `apps/web/src/pages/bankAccounts/BankAccountListPage.tsx:156`, `apps/web/src/pages/bankAccounts/BankAccountListPage.tsx:206`, `apps/web/src/pages/bankAccounts/BankAccountListPage.tsx:224`, `apps/web/src/components/bankAccounts/BankAccountVisual.tsx:90`, `packages/api/src/services/banking/bankAccounts.service.ts:126`, `packages/api/src/services/banking/bankAccounts.service.ts:144`

### Add or edit a bank account <!-- F-BANK-002 -->

**What it does:** "Add bank account" / "Edit bank account" records an account's details. Recognised banks fill in the IFSC's first five characters; a full IFSC looks up the branch name and address; the customer ID is copied from another account you have at the same bank.

**Why it exists:** Code comments: users paste numbers with spaces; "CIFs are per bank, not per account"; the IFSC lookup "pulls branch name + address".

**Where to find it:** **Bank Accounts → Add account**, tile **Edit**, or detail **Edit**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Type or pick the **Bank** (suggestions list Indian banks with their IFSC prefix). For a recognised bank, an empty IFSC becomes the bank's four letters plus "0", and the Customer ID is copied from your other account at that bank ("From your other <bank> account.").
2. Choose **Type** and fill **Account holder** (suggestions: your name and holders on your other accounts).
3. Either type **Last 4 digits**, or type the **Full account number (optional)** — the last 4 then fill themselves and lock.
4. Type the **IFSC**. A complete code shows "Looking up branch…" and fills **Branch** and **Branch address**.
5. Fill **Customer ID**, optional **Nickname**, **Current balance (₹)** (the **As of** date becomes today when you first type a balance), nominee, joint holders, debit card and **Status**.
6. Click **Add account** (or **Save changes**). It reads **Saving…**, then "Account added" / "Account updated".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Bank \*** ("Search HDFC, SBI, Kotak…") | Suggest input | Bank name | — |
| **Type** | Select | Savings, Current, Salary, Nre, Nro, Od | — |
| **Account holder \*** ("Name on account") | Suggest input | Holder name | — |
| **Last 4 digits \*** | Text | Last 4 digits | Read-only while a full number is typed |
| **Full account number (optional)** | Text | Full number (placeholder "Saved — type a new one to replace it" when one is saved) | — |
| **IFSC** | Text | Branch code; lookup when complete | — |
| **Branch**, **Branch address** | Text | Branch details ("Filled from the IFSC — edit if needed") | — |
| **Customer ID \*** ("Bank-issued CIF / Customer ID") | Text | Customer ID | — |
| **Nickname (optional)** ("Primary salary, Emergency fund…") | Text | Name shown on the tile | — |
| **Current balance (₹)**, **As of** | Text, date | Balance and its date | — |
| **Nominee name**, **Relation** | Suggest inputs | Nominee; picking a known nominee fills the relation | — |
| **Joint holders (comma-separated)** | Text | Joint holders | — |
| **Card last 4**, **Expiry** (MM, YY) | Text, selects | Linked debit card | — |
| **Status** | Select | Active, Dormant, Closed | — |
| **Cancel** / **Add account** / **Save changes** | Buttons | Close / save | Save disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Bank | Text | Yes | ≤200 characters | Empty | "Required" |
| Account holder | Text | Yes | ≤200 | Your name (new account) | "Required" |
| Last 4 digits | Text | Yes | Exactly 4 digits | Empty | "Must be 4 digits" |
| Full account number | Text | No | 6–18 digits after removing spaces and hyphens | Empty (never shown back) | "Must be 6–18 digits"; server "Account number must be 6–18 digits" |
| IFSC | Text | No | 11 characters: 4 letters, 0, 6 letters/digits; a bare "XXXX0" counts as not entered | Bank prefix | "11 characters, e.g. HDFC0001234" |
| Customer ID | Text | Yes in the form (optional on the server) | ≤64 | Copied from same bank | "Required" |
| Nickname | Text | No | ≤120 | — | — |
| Current balance | Text | No | A number, may be negative | Empty | "Must be a number" |
| Nominee / Relation | Text | No | ≤200 / ≤60 | — | — |
| Card last 4 | Text | No | 4 digits | — | "Must be 4 digits" |
| Expiry | Two selects | No | Both month and year, or neither; years from this year to +20 | — | "Pick both month and year" |
| Status | Select | Yes | Active, Dormant, Closed | Active | — |

**Settings and toggles here:** S-BANK-001 **Account type** — a label (Savings, Current, Salary, NRE, NRO, OD); no calculation uses it. S-BANK-002 **Status** — Active accounts count in **Total balance**; Closed accounts are skipped when email events are matched to an account (F-BANK-008); Dormant/Closed tiles show the status instead of "Available balance".

**Results:** The account is saved; the full number is encrypted; the customer ID is stored encrypted too. Typing a new full number replaces the saved one and updates the last 4.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "IFSC not found — check the code." | No branch has that code | Check the code |
| "Couldn't look up the branch. Fill it in below." | Lookup service unreachable | Type branch details by hand |
| "Failed to add account" / "Failed to update account" | Server rejected the data (the specific reason is not shown) | Check lengths and formats above |

**Limitations:** The form requires Customer ID although the server does not. Saving an edit always re-saves the balance, so an account updated from email loses its "live" mark after you edit it (see DOCUMENTATION_GAPS.md). The saved full number cannot be removed from the form (leaving the box empty keeps it). Opening and closing dates exist on the server but are not in the form.

**How it works:** `POST /api/bank-accounts` / `PATCH /api/bank-accounts/:id`. IFSC details come from `GET /api/bank-accounts/ifsc/:code`, which asks Razorpay's public IFSC service (5-second timeout) and remembers answers, including "not found", in server memory. A new account fills only empty branch fields; editing to a different IFSC replaces them. A balance typed here sets the balance date to the **As of** date (today if blank) and marks the source as manual.

**Related features:** F-BANK-001, F-BANK-004, F-BANK-005.

**Sources:** `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:24`, `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:229`, `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:254`, `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:270`, `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:300`, `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:318`, `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:337`, `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:448`, `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:469`, `packages/api/src/controllers/bankAccounts.controller.ts:26`, `packages/api/src/controllers/bankAccounts.controller.ts:115`, `packages/api/src/services/banking/bankAccounts.service.ts:98`, `packages/api/src/services/banking/bankAccounts.service.ts:166`, `packages/api/src/services/banking/bankAccounts.service.ts:245`, `packages/api/src/services/banking/ifscLookup.service.ts:14`, `packages/api/src/services/banking/ifscLookup.service.ts:63`

### Delete a bank account <!-- F-BANK-003 -->

**What it does:** Deletes an account after an in-tile confirmation "Delete <bank> account ending <last 4>?".

**Why it exists:** Inferred from behavior: remove accounts you no longer track (you can also mark them Closed instead).

**Where to find it:** **Bank Accounts** → tile → **Delete**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Click **Delete** on the tile. The tile turns into a confirmation.
2. Click **Delete** to confirm ("Account deleted") or **Cancel**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Delete** / **Cancel** | Buttons | Confirm / cancel | **Delete** disabled while deleting |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** The account and its balance history are deleted; cash-flow entries that were attached to it are kept but no longer linked to an account.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to delete account" | Server error | Try again |

**Limitations:** No undo; there is no Delete button on the detail page.

**How it works:** `DELETE /api/bank-accounts/:id` (owner checked); balance snapshots are removed by cascade; cash flows keep their rows with the account link cleared.

**Related features:** F-BANK-001.

**Sources:** `apps/web/src/pages/bankAccounts/BankAccountListPage.tsx:185`, `apps/web/src/pages/bankAccounts/BankAccountListPage.tsx:243`, `packages/api/src/services/banking/bankAccounts.service.ts:259`, `packages/api/prisma/schema.prisma:3232`, `packages/api/prisma/schema.prisma:1259`

### Bank account detail <!-- F-BANK-004 -->

**What it does:** Shows one account: the large building tile, **Edit**, **Record balance**, **Share details**; an **Available balance** card ("As of <date>", with a pulsing "live from Gmail" when updated from email); **Bank details** (Bank, Type, Account number with eye, Customer ID, IFSC, Branch, Branch address, Status); **Holder & nominee** (Holder, Joint, Nominee, Relation); **Linked debit card** (Card last 4 as "•••• 1234", Expires) when set; then balance history (F-BANK-007) and recent activity (F-BANK-008).

**Why it exists:** Inferred from behavior: every detail of one account, plus how its balance moved.

**Where to find it:** **Bank Accounts** → tile (route `/bank-accounts/:id`).

**Who can use it:** The account's owner.

**Steps**
1. Read the details. Use **Edit**, **Record balance** or **Share details**.
2. Click **All accounts** to go back.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **All accounts** | Button | Opens `/bank-accounts` | — |
| **Edit** | Button | F-BANK-002 | — |
| **Record balance** | Button | F-BANK-007 | — |
| **Share details** | Button | F-BANK-006 | — |
| Account number eye | Toggle | F-BANK-005 | — |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Account not found." with **Back to bank accounts** | Deleted, or not yours | Go back |

**Limitations:** Empty fields show "—".

**How it works:** `GET /api/bank-accounts/:id` (owner only) with up to the 365 most recent balance records.

**Related features:** F-BANK-005, F-BANK-006, F-BANK-007, F-BANK-008.

**Sources:** `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:130`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:154`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:197`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:213`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:241`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:279`, `packages/api/src/services/banking/bankAccounts.service.ts:155`

### Reveal full account number <!-- F-BANK-005 -->

**What it does:** The account number shows as "●●●● ●●●● 1234". The eye (**Show account number**) fetches and shows the full number grouped in fours; clicking again (**Hide account number**) masks it.

**Why it exists:** Code comment: the full number is "fetched on demand from the audited reveal endpoint and held only in component state".

**Where to find it:** The account number line on a tile or on the detail page.

**Who can use it:** The account's owner.

**Steps**
1. Click the eye. A spinner shows, then the full number.
2. Click again to hide it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Show account number** / **Hide account number** | Icon toggle | Reveals/masks | Disabled while loading |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** Each reveal writes an audit record ("pii_view", account number). The number re-masks when you open another account or the account changes.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Only the last 4 digits are saved. Edit the account to add the full number." | No full number saved | Edit the account |
| "Could not reveal the account number. Try again in a minute." | Error, or more than 5 reveals/shares in a minute | Wait a minute |
| "Could not decrypt the account number — the encryption key may have changed" | Server key problem | Contact support |

**Limitations:** Reveal and share together are limited to 5 per minute per user.

**How it works:** `POST /api/bank-accounts/:id/reveal` (rate-limited, response not cached) decrypts the stored number and records the audit row before returning it.

**Related features:** F-BANK-006.

**Sources:** `apps/web/src/components/bankAccounts/AccountNumberReveal.tsx:6`, `apps/web/src/components/bankAccounts/AccountNumberReveal.tsx:39`, `apps/web/src/components/bankAccounts/AccountNumberReveal.tsx:43`, `apps/web/src/components/bankAccounts/AccountNumberReveal.tsx:68`, `packages/api/src/routes/bankAccounts.routes.ts:38`, `packages/api/src/middleware/rateLimit.ts:196`, `packages/api/src/services/banking/bankAccounts.service.ts:114`, `packages/api/src/services/banking/bankAccounts.service.ts:274`

### Share bank details <!-- F-BANK-006 -->

**What it does:** **Share details** prepares a text with the bank name, holder, full account number, IFSC, branch and branch address. On touch devices it opens your phone's share sheet (WhatsApp, SMS, email…); on computers it copies the text ("Bank details copied").

**Why it exists:** Code comment: "Plain-text bank details for the user to send onward (to receive a transfer)."

**Where to find it:** Under each tile and on the detail page.

**Who can use it:** The account's owner.

**Steps**
1. Click **Share details**. A spinner shows.
2. Choose an app in the share sheet, or paste the copied text where you need it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Share details** | Button | Builds and shares/copies the text | Disabled while loading |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** The text is lines: "<Bank> account details", "Account holder: <name>", "Account number: <number>", and when known "IFSC: …", "Branch: …", "Branch address: …". An audit record "pii_share" is written. Missing branch name/address are filled from the IFSC and saved to the account.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Add the full account number (Edit) to share bank details." | No full number saved | Edit the account |
| "Couldn't load bank details. Try again in a minute." | Error or rate limit (5 per minute) | Wait |
| "Couldn't copy: the browser blocked clipboard access." | Browser refused | Allow clipboard access |

**Limitations:** Closing the share sheet without choosing an app does nothing; other share-sheet failures fall back to copying.

**How it works:** `POST /api/bank-accounts/:id/share` (shares the 5-per-minute limit with reveal); the IFSC lookup failing does not block sharing.

**Related features:** F-BANK-005.

**Sources:** `apps/web/src/components/bankAccounts/ShareBankDetailsButton.tsx:8`, `apps/web/src/components/bankAccounts/ShareBankDetailsButton.tsx:15`, `apps/web/src/components/bankAccounts/ShareBankDetailsButton.tsx:32`, `apps/web/src/components/bankAccounts/ShareBankDetailsButton.tsx:52`, `packages/api/src/services/banking/bankAccounts.service.ts:312`, `packages/api/src/services/banking/bankAccounts.service.ts:347`, `packages/api/src/services/banking/bankAccounts.service.ts:387`

### Record balance and balance history <!-- F-BANK-007 -->

**What it does:** **Record balance** saves an account's balance on a date. With two or more records, a **Balance history** chart appears; **Recorded balances** lists every record (Date, Balance, Source, Note) with a delete button.

**Why it exists:** Inferred from behavior: track how a balance changes over time from statements.

**Where to find it:** Bank account detail → **Record balance**; sections below the details.

**Who can use it:** The account's owner.

**Steps**
1. Click **Record balance**. "Record balance" opens.
2. Set **As of** (today by default), **Balance (₹)** and optional **Note (optional)**.
3. Click **Record**. "Balance recorded" appears.
4. To remove a record, click its bin (**Delete**) — it is deleted at once.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **As of** | Date | Date of the balance | — |
| **Balance (₹)** ("123456.78") | Text | Amount | — |
| **Note (optional)** ("Monthly statement, etc.") | Text | Note | — |
| **Cancel** / **Record** | Buttons | Close / save | **Record** disabled until the balance is a number, and while saving |
| **Delete** (bin in a row) | Icon button | Deletes that record | Disabled while deleting |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| As of | Date | Yes | YYYY-MM-DD | Today (UTC date) | Server validation message |
| Balance | Text | Yes | Number, may be negative | — | Button stays disabled |
| Note | Text | No | ≤500 characters | — | — |

**Settings and toggles here:** None.

**Results:** One record per account per date — recording the same date again replaces it. If it is the newest record, the account's current balance and "As of" date take its values.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to save snapshot" | Server error | Try again |

**Limitations:** Deleting a record does not change the account's current balance and has no confirmation or message. The chart's axis shows thousands ("₹100k") and is not hidden by **Hide values**. The default date is the UTC date, which before 05:30 IST is yesterday.

**How it works:** `POST /api/bank-accounts/:id/snapshots` upserts by (account, date); `DELETE /api/bank-accounts/snapshots/:id` checks ownership. Records you add are "manual"; the account's balance source becomes "statement" when a manual record is the newest.

**Related features:** F-BANK-004, F-BANK-008.

**Sources:** `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:53`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:109`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:142`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:300`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:326`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:365`, `packages/api/src/controllers/bankAccounts.controller.ts:54`, `packages/api/src/services/banking/bankAccounts.service.ts:400`, `packages/api/src/services/banking/bankAccounts.service.ts:427`, `packages/api/src/services/banking/bankAccounts.service.ts:445`

### Recent activity and live balance from email <!-- F-BANK-008 -->

**What it does:** **Recent activity** lists up to 50 latest credits and debits attached to this account (date, description, +/− amount). When EveryPaisa reads a bank alert (from your connected Gmail) whose last 4 digits match this account, the credit or debit is attached here and the balance moves with it; the balance then shows "live from Gmail" (tile: "· live").

**Why it exists:** Code comment: lets "UPI/NEFT/INTEREST credits/debits land against the right account based on accountLast4".

**Where to find it:** Bank account detail → **Recent activity** (shown when there is any).

**Who can use it:** The account's owner; requires email ingestion (D-BANK-001).

**Steps:** Not applicable — view only; entries arrive automatically.

**Controls:** None.

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** Inflows add to and outflows subtract from the current balance; a balance record for that day is written with source "auto event".

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| An alert's money does not appear on the account | You have two non-closed accounts ending in the same 4 digits, or the alert had no account digits | Give accounts distinct last 4 digits (mark old ones Closed) |
| The balance does not move with alerts | No current balance was ever entered | Enter a current balance once |

**Limitations:** Only the latest 50 entries are shown. Closed accounts are never matched.

**How it works:** When an email-parsed event is turned into a cash flow, the account is matched by last 4 digits among your non-closed accounts (exactly one match required); the balance is changed with an atomic increment, then that day's balance record is upserted. `GET /api/bank-accounts/:id/cashflows?limit=50` lists entries newest first.

**Related features:** F-BANK-007, D-BANK-001, D-BANK-002 (Cash Activity).

**Sources:** `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:136`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:224`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:419`, `packages/api/src/services/banking/bankAccounts.service.ts:458`, `packages/api/src/services/banking/bankAccounts.service.ts:486`, `packages/api/src/services/banking/bankAccounts.service.ts:517`

### What this area doesn't do
- Bank balances are not added to Total Net Worth on the Dashboard.
- There is no direct bank connection here; balances come from what you type, statements you record, or email alerts (account-aggregator connections are under Connectors).
- You cannot import a bank statement file on this page.
- You cannot see or share another family member's bank accounts.
- Deleting a recorded balance does not recalculate the current balance.

