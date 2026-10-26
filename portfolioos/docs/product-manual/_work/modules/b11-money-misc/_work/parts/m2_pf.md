## PPF & EPF

The **PPF & EPF** page (sidebar **Asset Classes → PPF & EPF**, route `/provident-fund`, page title **Provident Fund**) tracks Public Provident Fund and Employees' Provident Fund money in two ways. **Manual entries** — contributions, interest credits, withdrawals and opening balances — are ordinary transactions that build the PPF and EPF holdings on the page. **Auto-fetch accounts** link an EPFO UAN or a PPF account at one of seven banks so the passbook can be pulled from the portal (server-side, with you typing the captcha and OTP), uploaded as a PDF, or sent by the EveryPaisa browser extension. The old addresses `/ppf` and `/epf` open this page. Nothing here is plan-gated.

### Provident Fund page and holdings <!-- F-PF-001 -->
**What it does:** Shows your PPF and EPF holdings across all portfolios with a summary strip (**Invested**, **Current value**, **Unrealised P&L**), the holdings, a **Transactions** table of every PPF and EPF entry (date, name, type, quantity, price, amount) with edit and delete, and below it the **Auto-fetch accounts (EPFO portal)** section (F-PF-005).

**Why it exists:** Page description: "Track your PPF and EPF balances, contributions, and interest".

**Where to find it:** **Asset Classes → PPF & EPF** (route `/provident-fund`; `/ppf` and `/epf` redirect here).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person. Family view does not add other members' entries.

**Steps**
1. Open **Asset Classes → PPF & EPF**. With nothing recorded, the empty state "No provident fund yet" offers **Add first entry**.
2. Click **Add** and choose **PPF entry** (F-PF-003) or **EPF entry** (F-PF-002).
3. Click the pencil on a transaction to edit it in its form; click the bin, then **Yes** at "Sure?" to delete it (**No** cancels).
4. Use the download button for a holdings report (D-PF-002).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add** → **PPF entry** / **EPF entry** | Menu button | Opens the PPF or EPF form | Never |
| Download report button | Button | Holdings report for PPF and EPF (D-PF-002) | Never |
| Transaction edit / delete | Buttons | Edit in the matching form; delete after "Sure?" | — |

**Fields and rules:** Not applicable — see F-PF-002 and F-PF-003.

**Settings and toggles here:** None.

**Results:** Nothing changes by viewing.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to delete" | Server error | Try again |
| Balance fetched from EPFO doesn't show in the holdings | Auto-fetched passbook rows are stored separately and don't create holdings (see F-PF-006) | Add an **Opening / current balance** entry manually |

**Limitations:** Holdings come only from manual entries; auto-fetched or uploaded passbooks don't change them. The transactions table shows up to 200 entries per asset class. PPF and EPF have no market price, so **Current value** comes from the shared asset-page rules (D-PF-001).

**How it works:** The page is the shared asset-class page configured with asset classes PPF and EPF and two entry forms; it reads each portfolio's holdings and `GET /api/transactions?assetClass=PPF|EPF` (200 per class). Holdings group entries by account number (UAN / PPF account number) when given, otherwise by the employer or bank name typed.

**Related features:** F-PF-002, F-PF-003, F-PF-005, D-PF-001, D-PF-002.

**Sources:** @@W/pages/assetClasses/ProvidentFundPage.tsx#export function ProvidentFundPage@@, @@W/pages/assetClasses/ProvidentFundPage.tsx#{ label: 'PPF entry'@@, @@W/App.tsx#<Route path="/ppf"@@, @@W/App.tsx#<Route path="/epf"@@, @@W/pages/assetClasses/SimpleAssetPage.tsx#{ label: 'Invested'@@, @@W/pages/assetClasses/SimpleAssetPage.tsx#transactionsApi.list({ assetClass: ac, pageSize: 200 })@@, @@A/services/holdings/assetKey.ts#if (refs.isin && refs.isin.trim() !== '') return@@, @@A/priceFeeds/router.service.ts#case 'EPF':@@

### Add or edit an EPF entry <!-- F-PF-002 -->
**What it does:** The **Add EPF Entry** dialog records one EPF entry: employer, optional UAN, entry type (**Contribution (monthly)**, **Annual interest credit**, **Withdrawal / settlement**, **Opening / current balance**), date, amount, optional interest rate and notes. A second tab, **Auto-fetch (UAN)**, links the UAN for auto-fetch instead (F-PF-004).

**Why it exists:** Inferred from behavior: lets you keep an EPF balance without portal access.

**Where to find it:** **Asset Classes → PPF & EPF → Add → EPF entry**; editing: pencil on an EPF transaction.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Click **Add → EPF entry**. **Add EPF Entry** opens on **Manual entry** with entry type **Contribution (monthly)** and today's date.
2. Choose the **Portfolio**, fill **Employer Name**, optionally **UAN Number**.
3. Pick the **Entry Type**; the amount label changes (**Total Contribution (₹)**, **Interest Credited (₹)**, **Amount Withdrawn (₹)**, **Current Balance (₹)**) with a hint.
4. For **Annual interest credit**, optionally fill **Interest Rate Applied (% p.a.)**.
5. Click **Add EPF entry**. The toast "EPF entry added" appears.
6. When editing, **Delete** asks "Sure?" — **Yes, delete** removes it (toast "EPF entry deleted").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Manual entry** / **Auto-fetch (UAN)** | Tabs | Switch between entry and linking | Hidden when editing |
| **Entry Type** tiles | Radio | Choose entry type | — |
| **Add EPF entry** / **Save changes** | Button | Saves | Disabled while saving |
| **Delete** → **Yes, delete** / **Cancel** | Buttons | Deletes the entry | Edit only |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Portfolio** | Select | Yes | — | First portfolio | "Select a portfolio" |
| **Employer Name** | Text | Yes | — | Empty | "Enter employer name" |
| **UAN Number** | Text | No | Free text | Empty | — |
| **Date** | Date | Yes | YYYY-MM-DD | Today | "Invalid date" |
| Amount | Number | Yes | 0 or more, 2 decimals | Empty | Zod default message |
| **Interest Rate Applied (% p.a.)** | Number | No | 0–20 in the box | Empty (placeholder 8.25) | — |
| **Notes** | Text area | No | — | Empty | — |

**Settings and toggles here:** S-PF-001 **Entry Type (EPF)**.

**Results:** A transaction of class EPF is saved (quantity 1, price = amount). Contributions and opening balances add to the EPF holding; withdrawals reduce it; interest credits are recorded as income but do not add to the holding.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to save" / "Failed to delete" (or the server message) | Server rejected the entry | Read the message |

**Limitations:** The hint says "Interest at current EPF rate (8.25% for FY 2023-24)" — a fixed text, not looked up. Entries with and without a UAN for the same account become separate holdings.

**How it works:** `POST /api/transactions` (or `PATCH` / `DELETE /api/transactions/:id`) with asset class `EPF`, transaction type `DEPOSIT`, `INTEREST_RECEIVED`, `WITHDRAWAL` or `OPENING_BALANCE`, the UAN stored in the ISIN field. Holdings treat DEPOSIT and OPENING_BALANCE as additions and WITHDRAWAL as a reduction; INTEREST_RECEIVED is not an addition.

**Related features:** F-PF-001, F-PF-004, D-PF-003.

**Sources:** @@W/pages/assetClasses/EPFFormDialog.tsx#const TXN_LABELS@@, @@W/pages/assetClasses/EPFFormDialog.tsx#const AMOUNT_LABELS@@, @@W/pages/assetClasses/EPFFormDialog.tsx#const schema = z.object({@@, @@W/pages/assetClasses/EPFFormDialog.tsx#assetClass: 'EPF' as const@@, @@W/pages/assetClasses/EPFFormDialog.tsx#Auto-fetch (UAN)@@, @@A/services/holdings/holdingsProjection.ts#const BUY_TYPES@@, @@A/services/holdings/holdingsProjection.ts#const SELL_TYPES@@

### Add or edit a PPF entry <!-- F-PF-003 -->
**What it does:** The **Add PPF Entry** dialog records one PPF entry: bank / post office, optional PPF account number, entry type (**Annual / partial deposit**, **Yearly interest (31 Mar)**, **Partial / full withdrawal**, **Opening balance**, **Account matured (15 yr)**), date, amount, optional interest rate, optional account maturity date (for deposits) and notes. Its **Auto-fetch** tab links a PPF account instead (F-PF-004).

**Why it exists:** Inferred from behavior: lets you keep a PPF balance by hand.

**Where to find it:** **Asset Classes → PPF & EPF → Add → PPF entry**; editing: pencil on a PPF transaction.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Click **Add → PPF entry**. **Add PPF Entry** opens on **Manual entry**.
2. Choose **Portfolio**, fill **Bank / Post Office** (placeholder "e.g. SBI Branch, Andheri") and optionally **PPF Account Number**.
3. Pick **Entry Type**, **Date** and the amount (**Deposit Amount (₹)**, **Interest Credited (₹)**, **Amount Withdrawn (₹)**, **Current Balance (₹)** or **Maturity Proceeds (₹)**).
4. For interest, optionally fill **Interest / Return Rate (% p.a.)** (placeholder 7.10). For a deposit, optionally **Account Maturity Date**.
5. Click **Add PPF entry**. The toast "PPF entry added" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Manual entry** / **Auto-fetch** | Tabs | Switch | Hidden when editing |
| **Add PPF entry** / **Save changes** | Button | Saves | Disabled while saving |
| **Delete** → **Yes, delete** | Buttons | Deletes | Edit only |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Portfolio** | Select | Yes | — | First portfolio | "Select a portfolio" |
| **Bank / Post Office** | Text | Yes | — | Empty | "Enter account name" |
| **PPF Account Number** | Text | No | — | Empty | — |
| **Date** | Date | Yes | — | Today | "Invalid date" |
| Amount | Number | Yes | 0 or more | Empty | Zod default message |
| **Interest / Return Rate (% p.a.)** | Number | No | 0–30 in the box | Empty | — |
| **Account Maturity Date** | Date | No | Deposits only | Empty | — |

**Settings and toggles here:** S-PF-002 **Entry Type (PPF)**.

**Results:** A PPF transaction is saved. Deposits and opening balances add to the holding; withdrawals and maturity reduce it; interest credits don't add to it.

**Errors and troubleshooting:** "Failed to save" / "Failed to delete" or the server message.

**Limitations:** The rate hint "PPF rate: 7.1% p.a. for Q1 FY 2024-25" is fixed text.

**How it works:** Same transaction API as F-PF-002, asset class `PPF`, with `MATURITY` as an extra type. The same dialog file also serves NPS entries, documented in the NPS chapter (D-PF-003).

**Related features:** F-PF-001, F-PF-004.

**Sources:** @@W/pages/assetClasses/PPFNpsFormDialog.tsx#const CONFIG = {@@, @@W/pages/assetClasses/PPFNpsFormDialog.tsx#'Account matured (15 yr)'@@, @@W/pages/assetClasses/PPFNpsFormDialog.tsx#rateHint: 'PPF rate@@, @@W/pages/assetClasses/PPFNpsFormDialog.tsx#export function PPFFormDialog@@

### Link a PF account for auto-fetch <!-- F-PF-004 -->
**What it does:** Registers an EPF UAN (institution EPFO) or a PPF account at SBI, India Post, HDFC Bank, ICICI Bank, Axis Bank, Punjab National Bank or Bank of Baroda, so its passbook can be fetched. Available from **Link account** in the auto-fetch section (**Link PF Account** dialog), the EPF form's **Auto-fetch (UAN)** tab, and the PPF form's **Auto-fetch** tab.

**Why it exists:** "Connect an EPFO UAN or PPF account for auto-fetch." (dialog text)

**Where to find it:** **Asset Classes → PPF & EPF → Auto-fetch accounts (EPFO portal) → Link account**; or **Add → EPF entry → Auto-fetch (UAN)**; or **Add → PPF entry → Auto-fetch**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Click **Link account**. **Link PF Account** opens with type **EPF**.
2. Choose **EPF** or **PPF**; for PPF pick the **Bank**.
3. Fill **UAN (12 digits)** or **PPF Account Number**, and **Holder Name**.
4. Click **Link Account**. The toast "Account linked" appears and the account is listed.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **EPF** / **PPF** | Toggle buttons | Account type | — |
| **Bank** | Select | PPF bank | PPF only |
| **Link Account** (dialog) / **Link & enable auto-fetch** (EPF tab) / **Link PPF account** (PPF tab) | Button | Saves | Disabled until both fields are filled, and while saving |
| **Cancel** | Button | Closes | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **UAN (12 digits)** | Text | Yes (EPF) | Exactly 12 digits | Empty | "UAN must be exactly 12 digits" |
| **PPF Account Number** | Text | Yes (PPF) | 8–17 digits | Empty | "PPF account number must be 8–17 digits" (PPF tab: "Enter 8–17 digit PPF account number") |
| **Holder Name** | Text | Yes | 1–100 characters | Empty | "Enter account holder name" (PPF tab) |

**Settings and toggles here:** S-PF-005 **Type / Bank**.

**Results:** A provident-fund account is saved with the identifier encrypted and only its last 4 digits readable. A second account with the same type, institution and number is refused.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to link account" or the server message | Validation or duplicate | Check the number |

**Limitations:** There is no way to unlink or delete a linked account in the app.

**How it works:** `POST /api/epfppf/accounts`. The asset key is `pf:epf:<hash>` or `pf:ppf:<bank>:<hash>` of the normalised identifier; it is unique per user. The links from the forms do not set a portfolio.

**Related features:** F-PF-005, F-PF-006.

**Sources:** @@W/pages/assetClasses/ProvidentFundPage.tsx#function AddPfAccountDialog@@, @@W/pages/assetClasses/ProvidentFundPage.tsx#UAN must be exactly 12 digits@@, @@W/pages/assetClasses/EPFFormDialog.tsx#function AutoFetchForm@@, @@W/pages/assetClasses/PPFNpsFormDialog.tsx#const autoFetchSchema@@, @@A/controllers/pf.controller.ts#const CreateAccountSchema@@, @@A/services/pf/pfAccounts.service.ts#export function computePfAssetKey@@, @@P/schema.prisma#model ProvidentFundAccount {@@

### Auto-fetch accounts and refresh nudges <!-- F-PF-005 -->
**What it does:** Lists linked accounts (holder name, last 4 digits, type, institution, balance when known, last refresh date) with **Passbook** and **Refresh** buttons. An account not refreshed for 30 days or more, or never, gets a yellow banner ("Last refreshed N days ago — refresh to keep data current." / "Balance has never been refreshed — tap to fetch now.") with **Snooze 30d** and **Refresh now**.

**Why it exists:** Inferred from behavior: keeps fetched passbooks current.

**Where to find it:** **Asset Classes → PPF & EPF**, section **Auto-fetch accounts (EPFO portal)**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Read the list. With none: "No accounts linked yet. Click Link account to connect your EPFO UAN or PPF account."
2. Click **Snooze 30d** to hide the banner for 30 days (toast "Nudge snoozed for 30 days").
3. Click **Refresh** / **Refresh now** (F-PF-006) or **Passbook** (F-PF-007).
4. **Browser extension** opens the pairing page (F-PF-009).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Browser extension** | Link | Opens `/provident-fund/extension` | Never |
| **Link account** | Button | F-PF-004 | Never |
| **Snooze 30d** | Button | Snoozes the reminder | Banner only; disabled while saving |
| **Refresh now** / **Refresh** | Button | Opens **Refresh Provident Fund** | — |
| **Passbook** | Button | Opens **Upload Passbook PDF** | — |

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-PF-004 **Snooze 30d**.

**Results:** Snoozing hides the banner and dismisses open "Refresh … account" alerts for that account until the snooze ends.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to snooze" | Server error | Try again |
| The section is missing | Loading the accounts failed (the section hides itself on error) | Reload |

**Limitations:** The balance shown is never filled by any fetch (see F-PF-006), so it normally doesn't appear.

**How it works:** `GET /api/epfppf/accounts` (newest first, with member IDs); `POST /api/epfppf/accounts/:id/snooze-nudge` (`days` 30; 1–365 accepted) sets the snooze date and dismisses unread refresh alerts.

**Related features:** F-PF-006, F-PF-007, F-PF-009, F-PF-010.

**Sources:** @@W/pages/assetClasses/ProvidentFundPage.tsx#const STALE_DAYS = 30;@@, @@W/pages/assetClasses/ProvidentFundPage.tsx#function AutoFetchSection@@, @@W/pages/assetClasses/ProvidentFundPage.tsx#Balance has never been refreshed@@, @@A/controllers/pf.controller.ts#const SnoozeNudgeSchema@@, @@A/services/pf/pfNudges.service.ts#export async function snoozeNudge@@

### Refresh from the EPFO portal <!-- F-PF-006 -->
**What it does:** **Refresh Provident Fund** asks for the **UAN** and **Password**, starts a server-side fetch of the passbook, and relays the portal's captcha image and OTP to you to type in. When done it says "Imported N new entries."

**Why it exists:** To pull the passbook without downloading it yourself. Inferred from behavior.

**Where to find it:** **Asset Classes → PPF & EPF → Auto-fetch accounts → Refresh** (or **Refresh now**).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Click **Refresh**. Enter **UAN** (a hint appears if it isn't 12 digits: "Your UAN is 12 digits — not an email address. It is on your payslip.") and **Password**.
2. Optionally tick **Save credentials (encrypted)**.
3. Click **Start**. Progress shows the current step.
4. When asked, type the characters from the captcha image and click **Submit CAPTCHA**; then the OTP ("OTP sent via <channel>.") and **Submit OTP**.
5. On success: "Imported N new entries." — click **Close**. On failure the message shows with **Try again**.
6. Don't know the password? Click **Don't know your EPFO password?** (F-PF-008).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Save credentials (encrypted)** | Checkbox | Stores the UAN and password encrypted on the account | — |
| **Start** | Button | Starts the fetch | Disabled until UAN and password are filled |
| **Submit CAPTCHA** / **Submit OTP** | Buttons | Send your answer | Disabled with an empty box |
| **Try again** | Button | Back to the credentials | On error |
| **Don't know your EPFO password?** | Link | Opens the reset dialog | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **UAN** | Text | Yes | Hint only for non-12-digit input | Empty | — |
| **Password** | Password | Yes | — | Empty | — |
| Captcha / OTP | Text | Yes | 1–64 characters | Empty | "Invalid body" (server) |

**Settings and toggles here:** S-PF-003 **Save credentials (encrypted)**.

**Results:** Passbook rows are stored as confirmed passbook events against the account, and the account's last refresh date and source are set. These events appear in the provident-fund statement report (D-PF-004) but do not create PPF/EPF transactions or holdings, and do not set the account balance.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not start this right now. Please try again in a minute." | The job queue is unavailable | Wait and retry |
| "Connection to server lost" | The live connection dropped | Try again |
| "PF account not found" | The account is gone | Reload |

**Limitations:** The fetched balance and entries don't reach the page's holdings or the account's balance field (see DOCUMENTATION_GAPS.md). Saved credentials are not reused by the dialog — it always asks again — and there is no button to delete saved credentials. The dialog labels the login **UAN** even for PPF bank accounts. Each attempt runs once (no automatic retry) and is stopped after 10 minutes.

**How it works:** `POST /api/epfppf/sessions` creates a fetch session and queues a job on the `pf-headless-fetch` queue (Redis); the worker runs the institution's scraper and streams `status`, `captcha_required`, `otp_required`, `completed` and `failed` events to `GET /api/epfppf/sessions/:id/events`; answers go to `…/captcha` and `…/otp`. Rows become CanonicalEvents with status CONFIRMED (idempotent by source hash); the holding recompute runs only for accounts with a portfolio, and replays transactions only.

**Related features:** F-PF-005, F-PF-007, F-PF-008, D-PF-004.

**Sources:** @@W/pages/pf/PfRefreshDialog.tsx#export function PfRefreshDialog@@, @@W/pages/pf/PfRefreshDialog.tsx#Your UAN is 12 digits@@, @@W/pages/pf/PfRefreshDialog.tsx#Save credentials (encrypted)@@, @@A/controllers/pf.controller.ts#export async function startSessionHandler@@, @@A/controllers/pf.controller.ts#const QUEUE_UNAVAILABLE@@, @@A/jobs/pfFetchWorker.ts#const JOB_TIMEOUT_MS@@, @@A/jobs/pfFetchWorker.ts#attempts: 1@@, @@A/ingestion/projection.ts#ProvidentFundAccount.currentBalance is updated by the PF service@@

### Upload a passbook PDF <!-- F-PF-007 -->
**What it does:** **Upload Passbook PDF** imports an EPFO passbook PDF without the live portal. Password-protected PDFs prompt for the password.

**Why it exists:** "Upload an EPFO passbook PDF to import transactions without using the live portal. The file is processed server-side and not stored." (dialog text)

**Where to find it:** **Asset Classes → PPF & EPF → Auto-fetch accounts → Passbook**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Click **Passbook**. Choose a PDF; click **Upload**.
2. If the PDF is locked, enter its password in the prompt (it can be saved for next time).
3. The result shows "Imported N new entries." — click **Close**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| File picker (PDF) | File | Chooses the passbook | — |
| **Upload** | Button | Uploads; "Uploading…" | Disabled while uploading |
| **Cancel** / **Close** | Button | Closes | Disabled while uploading |

**Fields and rules:** PDF only, up to 10 MB; the file's type is checked from its contents.

**Settings and toggles here:** None.

**Results:** As F-PF-006: passbook events are stored and the last refresh date is set (source "MANUAL_PDF"); holdings and the balance field are not changed.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No file uploaded" | No file chosen | Choose a file |
| Password prompt / "PDF is password-protected" | Locked PDF | Enter the password |
| Scanned PDF message (code SCANNED_PDF) | The PDF is an image | Download a text PDF from EPFO |
| "PDF parse failed: …" or another parse message | Not an EPFO passbook layout | Use the EPFO passbook PDF |

**Limitations:** The parser reads the EPFO passbook layout even when the account is a PPF account.

**How it works:** `POST /api/epfppf/accounts/:id/passbook` (multipart, in memory, 10 MB). The PDF is unlocked with saved, derived or typed passwords, tokenised, parsed by the EPFO passbook parser and stored as CONFIRMED CanonicalEvents (adapter `pf.epfo.manual.v1`).

**Related features:** F-PF-006, D-PF-004.

**Sources:** @@W/pages/pf/PfManualUploadDialog.tsx#Upload an EPFO passbook PDF@@, @@A/controllers/pf.controller.ts#limits: { fileSize: 10 * 1024 * 1024 }@@, @@A/controllers/pf.controller.ts#export async function uploadManualPassbookHandler@@, @@A/controllers/pf.controller.ts#const result = parseEpfoPassbook@@, @@A/controllers/pf.controller.ts#lastFetchSource: 'MANUAL_PDF'@@

### Reset the EPFO password <!-- F-PF-008 -->
**What it does:** **Reset your EPFO password** collects the UAN, the mobile number registered with EPFO and a new password that meets EPFO's rules, and is meant to run the portal's reset with captcha and OTP relayed to you.

**Why it exists:** "Most people have never used their EPFO password … Without a way out, this dialog is a dead end for them." (code comment)

**Where to find it:** **Refresh Provident Fund → Don't know your EPFO password?**

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Fill **UAN**, **Mobile registered with EPFO** and **New password**; hints show what is missing ("Your UAN is 12 digits — it is on your payslip.", "Enter the 10-digit number EPFO has on file. The code can only go there.", "EPFO needs 7 to 20 characters, a letter, a digit, a special character.").
2. Click **Send code**. The dialog shows "Contacting EPFO…".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Send code** | Button | Starts the reset | Disabled until all three fields are valid |
| **Submit** / **Verify** | Buttons | Captcha / OTP answers | — |
| **Back to refresh** / **Close** / **Try again** | Buttons | Finish or retry | Per outcome |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **UAN** | Text | Yes | 12 digits (spaces and dashes ignored) | Empty | hint above |
| **Mobile registered with EPFO** | Text | Yes | 10 digits starting 6–9; +91 stripped | Empty | hint above |
| **New password** | Password | Yes | 7–20 characters with a letter, a digit and a special character | Empty | hint above |

**Settings and toggles here:** None.

**Results:** The new password is never stored. At most 3 resets are allowed per day ("Too many password reset attempts today. Try again tomorrow.").

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Stays on "Contacting EPFO…" | The web app starts the reset in browser-extension mode, and nothing in this repository runs extension-mode resets (see Limitations) | Reset the password on the EPFO portal directly |

**Limitations:** Defect: the dialog doesn't send a source, so the server defaults to the extension and queues nothing; no extension endpoint receives the session, so the reset never starts. See DOCUMENTATION_GAPS.md.

**How it works:** `POST /api/epfppf/password-reset` (`uan`, `mobile`, `newPassword`, `source` default `EXTENSION`); only `SERVER_HEADLESS` enqueues a `password-reset` job. Events would arrive on the same session stream as a refresh (`password_reset`, `lookup_failed`, `failed`).

**Related features:** F-PF-006, F-PF-009.

**Sources:** @@W/pages/pf/PfPasswordResetDialog.tsx#function passwordProblems@@, @@W/pages/pf/PfPasswordResetDialog.tsx#const sessionId = await pfApi.startPasswordReset({@@, @@A/controllers/pf.controller.ts#const PasswordResetSchema@@, @@A/controllers/pf.controller.ts#export async function startPasswordResetHandler@@, @@A/services/pf/uanLookup.service.ts#export const MAX_RESETS_PER_DAY = 3;@@

### Browser extension pairing <!-- F-PF-009 -->
**What it does:** The **Browser Extension** page pairs the EveryPaisa browser extension with your account using an 8-character code valid for 5 minutes, and lists **Connected extensions** with **Disconnect**.

**Why it exists:** "Connect the EveryPaisa browser extension to auto-fetch your EPF and PPF data." (page text)

**Where to find it:** **Asset Classes → PPF & EPF → Browser extension** (route `/provident-fund/extension`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Install the extension (the page says "from the Chrome Web Store").
2. Click **Generate pairing code**. The code and a countdown ("Expires in m:ss") appear with "Waiting for extension…".
3. In the extension popup, click **Pair** and enter the code. The page shows "Extension connected successfully!" and the toast "Extension connected!".
4. If the code expires: "Code expired. Generate a new one." → **Generate new code**.
5. Click **Disconnect** on a connected extension to revoke it (toast "Extension disconnected").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Generate pairing code** / **Generate new code** | Button | Creates a code | Disabled while generating |
| **Disconnect** | Button | Revokes the pairing | "Disconnecting…" while working |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** A paired extension gets a long-lived token it uses to send scraped passbooks to your account; disconnecting revokes it.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to generate pairing code" / "Failed to revoke" | Server error | Try again |

**Limitations:** The extension itself is not in this repository. The page polls every 3 seconds only while a code is valid.

**How it works:** `POST /api/epfppf/extension/pair-init`, `GET …/extension/pairings`, `DELETE …/extension/pairings/:id`. The extension calls `POST …/extension/pair-complete` (no sign-in; the code is the credential), then `GET …/extension/me`, `POST …/extension/raw-payload` and `POST …/extension/revoke` with its bearer token.

**Related features:** F-PF-006, F-PF-011, D-PF-005.

**Sources:** @@W/pages/pf/PfExtensionPairPage.tsx#export function PfExtensionPairPage@@, @@W/pages/pf/PfExtensionPairPage.tsx#Generate pairing code@@, @@W/pages/pf/PfExtensionPairPage.tsx#Code expired. Generate a new one.@@, @@A/routes/pf.routes.ts#pfRouter.post('/extension/pair-complete'@@, @@A/routes/pf.routes.ts#pfRouter.post('/extension/pair-init'@@

### PF refresh-due alerts <!-- F-PF-010 -->
**What it does:** Once a day, creates a "Refresh EPF account" / "Refresh PPF account" alert for each active linked account not refreshed for 30 days or more (or never), at most one unread per account and not again within 7 days, skipping snoozed accounts.

**Why it exists:** Code comment: "emits PF_REFRESH_DUE alerts so the user is prompted to re-fetch their balance."

**Where to find it:** **Alerts** (D-PF-006) and the yellow banner on the page (F-PF-005).

**Who can use it:** All users with linked accounts.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-PF-004 **Snooze 30d** suppresses it.

**Results:** Alert text: "<holder> (···1234) last refreshed N days ago — tap to refresh and keep data current." or "… has never been refreshed."

**Errors and troubleshooting:** None.

**Limitations:** The job is scheduled at 03:30 IST although its comments say 09:00 IST (see DOCUMENTATION_GAPS.md).

**How it works:** node-cron `30 3 * * *` with time zone Asia/Kolkata, running as system (all users); disabled by `ENABLE_PF_NUDGE_CRON=false`.

**Related features:** F-PF-005.

**Sources:** @@A/jobs/pfNudgeJob.ts#cron.schedule('30 3 * * *'@@, @@A/services/pf/pfNudges.service.ts#const STALE_DAYS = 30;@@, @@A/services/pf/pfNudges.service.ts#const RENUDGE_DAYS = 7;@@, @@A/services/pf/pfNudges.service.ts#const title = `Refresh@@

### What this area doesn't do

- You can't delete or unlink a linked auto-fetch account, or remove saved portal credentials.
- Fetched or uploaded passbooks don't update the PF holdings or the balance shown on the account.
- Interest rates are not looked up; the hints are fixed text.
- There is no PPF maturity or extension reminder.
