## Split Expenses

**Split Expenses** (sidebar **Tools → Split Expenses**) shares costs with friends, flatmates and trips: add people and groups, record who paid and how a bill is split, see who owes whom, and settle up in cash or by UPI. It is available on every plan. People you split with do not need an account; if one signs up later with the email you saved, they are linked automatically.

### Split home <!-- F-SPLIT-001 -->
**What it does:** The **Split Expenses** page shows two totals (**You are owed**, **You owe**), your **Groups** (name, number of people, currency and your balance), **Friends** (each person's overall balance with you across groups) and **Recent activity** (the latest 20 events, each linking to its group). Archived groups are hidden behind **Show archived (N)**.

**Why it exists:** Page description: "Share costs with friends, flatmates and trips — see who owes whom and settle up."

**Where to find it:** **Tools → Split Expenses** (route `/split`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER (on the managed person's groups; your display name is the managed person's).

**Steps**
1. Open **Tools → Split Expenses**.
2. Click a group or a friend to open it; use **New group** or **Add person** to start.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Settings** | Link | Opens `/split/settings` (F-SPLIT-017) | — |
| **Add person** | Button | F-SPLIT-002 | — |
| **New group** | Button | F-SPLIT-003 | — |
| **Show archived (N)** / **Hide archived** | Link button | Shows archived groups | Only when archived groups exist |
| **Retry** | Link button | Reloads a failed section | On error |

**Fields and rules:** None — view only.

**Settings and toggles here:** S-SPLIT-008 **Home currency** — the currency of the totals and friend balances.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't load balances." / "Couldn't load groups." / "Couldn't load activity." | Request failed | **Retry** |
| "No groups yet" | No groups | **New group** |
| "Balances with people appear here once you add expenses." | No friend balances | Add expenses in a group |

**Limitations:** Friend balances from groups in another currency are converted at the latest exchange rate and marked "≈"; if no rate exists for that currency pair, that group's balance is left out of the friend's total without a separate warning. A person you added appears under **Friends** only once they are in one of your groups.

**How it works:** `GET /api/split/friends` walks every group you are in (including 1:1 and archived), computes debts per pair (simplified or pairwise per the group setting), converts to your home currency and sums per person (rounded half-even to 2 places). `GET /api/split/groups` (active, non-1:1) and `?includeArchived=1`; `GET /api/split/activity` (default 50, max 200).

**Related features:** F-SPLIT-003, F-SPLIT-016, F-SPLIT-017.

**Sources:** `apps/web/src/pages/split/SplitHomePage.tsx:81`, `apps/web/src/pages/split/SplitHomePage.tsx:93`, `apps/web/src/pages/split/SplitHomePage.tsx:139`, `apps/web/src/pages/split/SplitHomePage.tsx:160`, `packages/api/src/services/split/ledger.service.ts:33`, `packages/api/src/services/split/ledger.service.ts:58`, `packages/api/src/services/split/ledger.service.ts:68`

### Add a person <!-- F-SPLIT-002 -->
**What it does:** **Add a person** saves someone you split with: **Name**, **Email (optional)**, **Phone (optional)** ("Optional — used later to invite them.").

**Why it exists:** Inferred from behavior: people are reusable across groups and can later be invited or linked to an account by email.

**Where to find it:** **Tools → Split Expenses → Add person**; also **+ Add a person** in **New group** and **+ New person** in a group's **Settings** tab.

**Who can use it:** R-FREE and above, R-MANAGER.

**Steps**
1. Enter **Name** (and optionally email/phone). Click **Add person**. The toast "<name> added" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add person** | Submit | Saves | While saving |
| **Cancel** | Button | Closes | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Name | Text | Yes | 1–120 characters | — | "Enter a name" |
| Email (optional) | Email | No | Valid email, up to 254 | — | "Invalid email address" |
| Phone (optional) | Text | No | 10–15 digits after cleaning; 10-digit numbers get 91 added | — | "Invalid phone number" |

**Settings and toggles here:** None.

**Results:** The person is saved to your contacts. If the email belongs to an existing account, they are linked to it.

**Errors and troubleshooting:** "Could not add the person" with the reason.

**Limitations:** The page has no way to edit or delete a person, or to store their UPI ID (the API supports all three, F-SPLIT-020).

**How it works:** `POST /api/split/contacts`. Email and phone are stored encrypted with a hash for matching.

**Related features:** F-SPLIT-003, F-SPLIT-015, F-SPLIT-019.

**Sources:** `apps/web/src/pages/split/ContactDialog.tsx:36`, `apps/web/src/pages/split/ContactDialog.tsx:57`, `packages/api/src/controllers/split.controller.ts:28`, `packages/api/src/services/split/contacts.service.ts:65`

### New group <!-- F-SPLIT-003 -->
**What it does:** **New group** creates a group with **Group name**, **Type** (Trip, Home, Couple, Other), **Currency** and **People** (tick saved people, or **+ Add a person**). You are added automatically under your name. After **Create group** the app opens the group.

**Why it exists:** Inferred from behavior: a group holds one shared ledger in one currency.

**Where to find it:** **Tools → Split Expenses → New group**.

**Who can use it:** R-FREE and above, R-MANAGER.

**Steps**
1. Enter **Group name**, choose **Type** and **Currency**, tick people.
2. Click **Create group** ("Group created"); the group page opens.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Type** | Select | S-SPLIT-001 | — |
| **Currency** | Select | S-SPLIT-002 | — |
| People checkboxes | Checkbox | Include a saved person | — |
| **+ Add a person** | Link | Opens F-SPLIT-002; the new person is ticked | — |
| **Create group** / **Cancel** | Buttons | Create or close | Create disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Group name | Text | Yes | 1–120 characters | — | "Name the group" |
| Type | Select | No | Trip / Home / Couple / Other | Trip (server default Other) | — |
| Currency | Select | No | INR, USD, EUR, GBP, AED, SGD, THB, JPY, AUD, CAD | INR | — |
| People | Checkboxes | No | Up to 50 | None | "That person is already in the group" |

**Settings and toggles here:** S-SPLIT-001 **Group type**, S-SPLIT-002 **Group currency** (fixed after creation), S-SPLIT-003 **Simplify debts** (on for new groups).

**Results:** A group with you and the chosen people; activity "created the group".

**Errors and troubleshooting:** "Could not create the group" with the reason.

**Limitations:** The currency can't be changed later ("fixed once a group is created"). The type can't be changed in the page.

**How it works:** `POST /api/split/groups` with `myDisplayName` (your name, or the managed person's when managing an account) and contact ids; created in one transaction with a `GROUP_CREATED` activity.

**Related features:** F-SPLIT-002, F-SPLIT-004, F-SPLIT-015.

**Sources:** `apps/web/src/pages/split/NewGroupDialog.tsx:15`, `apps/web/src/pages/split/NewGroupDialog.tsx:21`, `apps/web/src/pages/split/NewGroupDialog.tsx:41`, `apps/web/src/pages/split/NewGroupDialog.tsx:57`, `apps/web/src/pages/split/useSplitDisplayName.ts:5`, `packages/api/src/controllers/split.controller.ts:34`, `packages/api/src/services/split/groups.service.ts:123`

### Group page and expense list <!-- F-SPLIT-004 -->
**What it does:** A group page shows the name, people count and currency (or "Your 1:1 expenses"), **Your balance**, and four tabs: **Expenses**, **Balances** (F-SPLIT-011), **Activity**, **Settings** (F-SPLIT-015). **Expenses** lists expenses and payments by day (newest first): each expense shows a paperclip when it has a receipt, "<who> paid <amount>" (or "N people paid"), up to two label chips (+N), and your line ("you lent ₹…", "you borrowed ₹…", "settled", "not involved"); payments show "Payment — <A> paid <B> <amount>" with a delete button. Label chips at the top (**All**, then each label) filter expenses (payments are hidden while a label is selected).

**Why it exists:** Inferred from behavior: one view of what was spent and paid in the group.

**Where to find it:** **Tools → Split Expenses →** a group (route `/split/groups/:id`).

**Who can use it:** Active members of the group (R-FREE and above, R-MANAGER).

**Steps**
1. Click an expense to open it (F-SPLIT-006).
2. Click a label chip to filter; **All** to clear.
3. Click the bin on a payment and confirm **Delete** to remove it ("Payment deleted").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Settle up** | Button | F-SPLIT-012 | — |
| **Add expense** | Button | F-SPLIT-005 | — |
| Tabs **Expenses** / **Balances** / **Activity** / **Settings** | Tabs | Switch view | — |
| Label filter chips | Toggle buttons | Filter by label | Shown when the group has labels |
| Delete payment (bin) | Icon | Asks "Delete this payment? Balances will change back." | — |

**Fields and rules:** None.

**Settings and toggles here:** S-SPLIT-003 affects balances.

**Results:** Deleting a payment restores the balances it had settled.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This group doesn't exist or you're no longer in it." | Not a member | **Back to Split Expenses** |
| "Couldn't load expenses." / "Couldn't load payments." / "Couldn't load activity." | Request failed | **Retry** |
| "No expenses yet." | Empty group | **Add expense** |

**Limitations:** Payments can't be edited in the page (API only). Deleted expenses are not listed in the group; you reach one again only through its own address or the **Undo** toast (the API can list them).

**How it works:** `GET /api/split/groups/:id`, `/expenses`, `/settlements`, `/balances`, `/labels`, `/activity`; `DELETE /api/split/settlements/:id` (soft delete with `SETTLEMENT_DELETED` activity; refused if it would leave a member who has left the group with a non-zero balance).

**Related features:** F-SPLIT-005, F-SPLIT-006, F-SPLIT-011, F-SPLIT-012, F-SPLIT-015.

**Sources:** `apps/web/src/pages/split/GroupPage.tsx:31`, `apps/web/src/pages/split/GroupPage.tsx:68`, `apps/web/src/pages/split/GroupPage.tsx:118`, `apps/web/src/pages/split/GroupPage.tsx:294`, `apps/web/src/pages/split/GroupPage.tsx:310`, `apps/web/src/pages/split/GroupPage.tsx:386`, `packages/api/src/services/split/groups.service.ts:47`

### Add or edit an expense <!-- F-SPLIT-005 -->
**What it does:** The **Add expense** / **Edit expense** dialog records **Description**, **Amount**, **Currency** (with "1 <ccy> in <group ccy>" exchange rate when different), **Date**, **Paid by** (one person or **Multiple people** with amounts), **Split** mode — **Equally** (tick people), **Exact** (amount each), **Percent**, **Shares** (all start at 1) — with a live per-person preview, and optional **Labels**.

**Why it exists:** Inferred from behavior: covers the common ways a bill is shared, keeping totals exact to the paisa.

**Where to find it:** Group page → **Add expense**; expense page → **Edit**; friend page → **Add expense** (1:1).

**Who can use it:** Active group members (any member can edit any expense).

**Steps**
1. Enter **Description** and **Amount**; change **Currency** if needed (leave the rate blank to use the latest rate).
2. Pick the **Date** (not later than today).
3. Choose **Paid by**; for several payers choose **Multiple people** and enter each amount.
4. Pick a **Split** mode and fill it in; check the preview column.
5. Optionally tick **Labels**. Click **Save expense** ("Expense added" / "Expense updated").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Currency** | Select | Expense currency (S-SPLIT-006) | — |
| **1 <ccy> in <group ccy>** | Number | Exchange rate | Shown only for a foreign currency |
| **Paid by** | Select | One payer or **Multiple people** | — |
| **Equally** / **Exact** / **Percent** / **Shares** | Tabs | Split mode (S-SPLIT-005) | — |
| Include / value per person | Checkbox / number | Shares per person | — |
| Label chips | Toggle buttons | Labels for the expense | Shown when the group has labels |
| **Save expense** / **Cancel** | Buttons | Save or close | Save disabled until the form checks out |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Description | Text | Yes | 1–200 characters | — | "Add a description" |
| Amount | Number | Yes | > 0, at most 2 decimals, below 1e12 | — | "Enter an amount above 0 with at most 2 decimals" |
| Exchange rate | Number | No | Positive | Latest rate | "Enter a valid exchange rate or leave it blank" |
| Date | Date | Yes | Real date, not more than 1 day ahead (server) / today (web) | Today | "Invalid date" |
| Paid amounts (multiple) | Numbers | Yes | Must add up to the amount | — | "Paid amounts add up to ₹X, not ₹Y" |
| Exact amounts | Numbers | Yes | At most 2 decimals; must add up | — | "₹X left to assign" / "Over by ₹X" |
| Percent | Numbers | Yes | Must total 100 | — | "Percentages add up to N%, not 100%" |
| Any mode | — | — | At least one person | — | "Pick at least one person to split with" |

**Settings and toggles here:** S-SPLIT-005 **Split mode**, S-SPLIT-006 **Expense currency and exchange rate**.

**Results:** The expense is saved with each person's share; balances, "Add my share to Cash Activity" entries and the activity feed update.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No <A>/<B> rate — enter one manually" | No stored exchange rate | Type a rate |
| "Re-add <name> before changing their past entries" | The change would leave a member who left with a balance | Re-add them first |
| "A participant is not in this group" | Someone left meanwhile | Reload |
| "Restore the expense before editing it" | Expense is deleted | Restore it |
| "Expense saved, but its labels could not be updated" | Labels step failed | Set labels on the expense page |

**Limitations:** Only the 10 listed currencies (plus the group's) can be picked. Members who left the group can't be chosen.

**How it works:** `POST /api/split/expenses` / `PATCH /api/split/expenses/:id`, then `PUT /api/split/expenses/:id/labels` if labels changed. Allocation is in whole paise: each person gets floor(total × weight ÷ total weight) and leftover paise go one at a time in ascending member-id order; Exact amounts must sum exactly; Percent must total 100. The base-currency amount = amount × rate rounded half-even to 2 places, then spread over shares and payers in proportion.

**Related features:** F-SPLIT-004, F-SPLIT-006, F-SPLIT-008, F-SPLIT-010.

**Sources:** `apps/web/src/pages/split/AddExpenseDialog.tsx:18`, `apps/web/src/pages/split/AddExpenseDialog.tsx:114`, `apps/web/src/pages/split/AddExpenseDialog.tsx:119`, `apps/web/src/pages/split/AddExpenseDialog.tsx:215`, `apps/web/src/pages/split/expenseForm.ts:152`, `apps/web/src/pages/split/expenseForm.ts:174`, `apps/web/src/pages/split/expenseForm.ts:199`, `apps/web/src/pages/split/expenseForm.ts:204`, `packages/api/src/controllers/split.controller.ts:48`, `packages/api/src/services/split/allocate.ts:31`, `packages/api/src/services/split/allocate.ts:83`, `packages/api/src/services/split/fx.ts:22`, `packages/api/src/services/split/validate.ts:10`, `packages/api/src/services/split/groups.service.ts:53`

### Expense details, delete and restore <!-- F-SPLIT-006 -->
**What it does:** The expense page shows the description, date and split mode ("Split equally", "Exact amounts", "By percent", "By shares"), the amount (and its group-currency equivalent with the rate if foreign), **Paid by** and **Split between** lists, receipt, labels, comments, Cash Activity (F-SPLIT-007 to F-SPLIT-010) and "Added <date>". **Edit** opens F-SPLIT-005; **Delete** deletes at once with an 8-second "Expense deleted — Undo" toast; a deleted expense shows **Restore**.

**Why it exists:** Inferred from behavior: a delete is reversible because it changes everyone's balances.

**Where to find it:** Click an expense in a group (route `/split/expenses/:id`).

**Who can use it:** Active group members.

**Steps**
1. Click **Delete**; click **Undo** in the toast to bring it back, or later open it and click **Restore** ("Expense restored").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Edit** | Button | Opens the edit dialog | Hidden when deleted |
| **Delete** | Button | Soft-deletes | Hidden when deleted |
| **Undo** | Toast button | Restores | For 8 seconds |
| **Restore** | Button | Restores | Only when deleted |
| <group name> | Back link | Back to the group | — |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** Deleting removes the expense from balances and from linked Cash Activity entries; restoring puts both back.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This expense isn't available." | Not a member / doesn't exist | **Back** |
| "Could not delete" / "Could not restore" + reason | e.g. a member who left would be left with a balance | Re-add them |

**Limitations:** No confirmation before delete (Undo instead). Receipts, labels and comments are read-only on a deleted expense.

**How it works:** `DELETE /api/split/expenses/:id` sets `deletedAt` and records `EXPENSE_DELETED`; `POST …/restore` clears it. Both re-sync Cash Activity links.

**Related features:** F-SPLIT-005, F-SPLIT-007, F-SPLIT-010.

**Sources:** `apps/web/src/pages/split/ExpenseDetailPage.tsx:19`, `apps/web/src/pages/split/ExpenseDetailPage.tsx:47`, `apps/web/src/pages/split/ExpenseDetailPage.tsx:50`, `apps/web/src/pages/split/ExpenseDetailPage.tsx:74`, `packages/api/src/services/split/expenses.service.ts:184`, `packages/api/src/services/split/expenses.service.ts:190`

### Receipt <!-- F-SPLIT-007 -->
**What it does:** The **Receipt** card shows the attached image or an **Open PDF** link, with **Add receipt** / **Replace** and **Remove** ("Remove this receipt?").

**Why it exists:** Inferred from behavior: keeps the bill with the expense for everyone in the group.

**Where to find it:** Expense page → **Receipt**.

**Who can use it:** Active group members; changes only while the expense is not deleted.

**Steps**
1. Click **Add receipt**, choose a JPEG, PNG, WebP or PDF under 10 MB ("Receipt saved").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add receipt** / **Replace** | Button | Uploads | Hidden on a deleted expense; disabled while uploading |
| **Remove** | Button | Asks, then removes | Hidden on a deleted expense |
| **Retry** | Button | Reloads the receipt | When it failed to load |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Receipt file | File | — | JPEG, PNG, WebP or PDF; under 10 MB; 10 uploads/minute | — | "Receipts must be under 10 MB" / "Upload a JPEG, PNG, WebP or PDF receipt" / "HEIC photos aren't supported - share the photo as JPEG" / "We couldn't read this image - try saving it as JPEG or PNG" |

**Settings and toggles here:** None.

**Results:** One receipt per expense; replacing deletes the old file. Activity records "attached a receipt" / "removed the receipt".

**Errors and troubleshooting:** "Couldn't upload the receipt", "Couldn't load the receipt", "Receipt no longer available".

**Limitations:** One receipt per expense.

**How it works:** `PUT /api/split/expenses/:id/receipt` (multipart `file`, rate-limited 10/min per user), `GET` (served inline, no caching), `DELETE`. Image metadata is stripped before storing; the file type is checked from its bytes.

**Related features:** F-SPLIT-006.

**Sources:** `apps/web/src/pages/split/ExpenseExtras.tsx:16`, `apps/web/src/pages/split/ExpenseExtras.tsx:96`, `packages/api/src/routes/split.routes.ts:60`, `packages/api/src/routes/split.routes.ts:68`, `packages/api/src/services/split/receipts.service.ts:40`, `packages/api/src/services/split/receipts.service.ts:42`, `packages/api/src/middleware/rateLimit.ts:207`

### Labels <!-- F-SPLIT-008 -->
**What it does:** Group-level labels (name + one of 7 colours) you can tick on an expense; **New label** creates one. Labels filter the group's expense list.

**Why it exists:** Inferred from behavior: categorise shared spending (for example "Food", "Travel").

**Where to find it:** Expense page → **Labels**; also in the add/edit dialog.

**Who can use it:** Active group members.

**Steps**
1. On an expense click **New label**, type a **Label name**, pick a colour, **Create**.
2. Tick or untick labels on the expense.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Label chips | Toggles | Set labels on the expense | Read-only on a deleted expense |
| **New label** | Button | Opens the create form | — |
| **Label name**, colour | Text / radio | New label | — |
| **Create** / **Cancel** | Buttons | Save or close | Create disabled with an empty name |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Label name | Text | Yes | 1–30 characters, unique in the group | — | "Label name must be 1–30 characters" / "That label already exists" |
| Colour | Choice | Yes | One of 7 hex colours | Red | "Pick a colour like #3D5A80" |
| Labels per expense | — | — | At most 10, from the same group | — | "At most 10 labels" |

**Settings and toggles here:** None.

**Results:** Labels show on the expense and in the group list.

**Errors and troubleshooting:** "Couldn't create the label", "Couldn't update labels".

**Limitations:** Labels can't be renamed or deleted in the page (delete exists in the API).

**How it works:** `GET/POST /api/split/groups/:id/labels`, `PUT /api/split/expenses/:id/labels`, `DELETE /api/split/labels/:id`.

**Related features:** F-SPLIT-004, F-SPLIT-005.

**Sources:** `apps/web/src/pages/split/ExpenseExtras.tsx:173`, `apps/web/src/pages/split/ExpenseExtras.tsx:187`, `packages/api/src/services/split/labels.service.ts:13`, `packages/api/src/services/split/labels.service.ts:33`, `packages/api/src/services/split/labels.service.ts:50`

### Comments <!-- F-SPLIT-009 -->
**What it does:** A comment thread on each expense: author, time, text; **Post** adds one; your own comments have a delete button ("Delete this comment?").

**Why it exists:** Inferred from behavior: discuss an expense with the group.

**Where to find it:** Expense page → **Comments**.

**Who can use it:** Active group members; delete only your own.

**Steps**
1. Type in **Add a comment** and click **Post**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add a comment** | Text area | Comment text | Hidden on a deleted expense |
| **Post** | Button | Posts | Empty text; while posting |
| Delete comment (bin) | Icon | Deletes after confirmation | Only on your comments; not on a deleted expense |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Comment | Text | Yes | 1–1,000 characters | — | "Write a comment first" / "Comments can be at most 1000 characters" |

**Settings and toggles here:** None.

**Results:** The comment appears to all members; activity records "commented on".

**Errors and troubleshooting:** "Couldn't post the comment", "Couldn't delete the comment", "Only the author can delete a comment".

**Limitations:** Comments can't be edited.

**How it works:** `GET/POST /api/split/expenses/:id/comments`, `DELETE /api/split/comments/:id`.

**Related features:** F-SPLIT-006.

**Sources:** `apps/web/src/pages/split/ExpenseExtras.tsx:237`, `packages/api/src/controllers/split.controller.ts:147`, `packages/api/src/services/split/comments.service.ts:54`

### Add my share to Cash Activity <!-- F-SPLIT-010 -->
**What it does:** A switch "Add my share (₹…) to Cash Activity" on each expense you are part of. On, it creates an outflow in your Cash Activity for your share ("Split: <description> (<group>)") and keeps it in step when anyone edits, deletes or restores the expense. If you have no default portfolio it first asks "Pick a portfolio for this entry".

**Why it exists:** Code comment: "'Add my share to Cash Activity'… the CashFlow it points at is derived from the expense and rewritten on every sync."

**Where to find it:** Expense page → **Cash Activity**.

**Who can use it:** Members with a share in the expense.

**Steps**
1. Turn the switch on. If asked, choose a portfolio.
2. Turn it off to remove the entry.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "Add my share (…) to Cash Activity" | Switch | S-SPLIT-012 | Disabled on a deleted expense; replaced by "Not part of this split" when your share is 0 |
| Portfolio picker ("Choose a portfolio") | Select | Portfolio for the entry | Shown when no default portfolio is set |

**Fields and rules:** Portfolio must be one of yours ("Pick one of your portfolios for Cash Activity").

**Settings and toggles here:** S-SPLIT-012 **Add my share to Cash Activity**; S-SPLIT-009 **Default portfolio** (used automatically).

**Results:** An outflow in **Cash Activity** (D-SPLIT-001) for your share, in the group currency, with an INR equivalent at the latest rate for foreign groups ("(rate unavailable)" added to the description when no rate exists).

**Errors and troubleshooting:** "you're not part of this expense", "Couldn't update Cash Activity", "Couldn't load Cash Activity."

**Limitations:** Payments (settlements) are not added to Cash Activity.

**How it works:** `GET/PUT /api/split/expenses/:id/share-link`. Each link's cash flow is re-synced after expense create/edit/delete/restore (run as system so another member's edit updates your entry) and by a nightly reconcile at 02:30 IST.

**Related features:** F-SPLIT-017, D-SPLIT-001, D-SPLIT-002.

**Sources:** `apps/web/src/pages/split/ExpenseExtras.tsx:284`, `apps/web/src/pages/split/ExpenseExtras.tsx:302`, `apps/web/src/pages/split/ExpenseExtras.tsx:310`, `packages/api/src/services/split/shareLink.service.ts:155`, `packages/api/src/services/split/shareLink.service.ts:176`, `packages/api/src/services/split/expenses.service.ts:175`, `packages/api/src/jobs/splitShareLinkReconcileJob.ts:22`

### Balances and suggested payments <!-- F-SPLIT-011 -->
**What it does:** The **Balances** tab lists each member's net ("you are owed / you owe" for you, "is owed / owes" for others) and then **Suggested payments** (when Simplify debts is on) or **Who owes whom** (when off), each as "<A> pays <B> ₹…" with action buttons. "Everyone is settled up." when there is nothing.

**Why it exists:** Settings text: "Simplify debts (fewest payments to settle)".

**Where to find it:** Group page → **Balances**.

**Who can use it:** Active group members.

**Steps**
1. Read the list. Use **Settle**, **Pay**, **Remind** or **Share pay link** on a row (F-SPLIT-012 to F-SPLIT-014).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Settle** | Button | Opens Settle up pre-filled | — |
| **Pay** | Button | F-SPLIT-013 | Only on rows where you pay, INR groups only |
| **Remind** | Button | F-SPLIT-014 | Only on rows where you are paid |
| **Share pay link** | Button | F-SPLIT-014 | Rows where you are paid, INR groups only |

**Fields and rules:** None.

**Settings and toggles here:** S-SPLIT-003 **Simplify debts**.

**Results:** None.

**Errors and troubleshooting:** "Couldn't load balances." → **Retry**.

**Limitations:** Members who left are shown only while their balance is non-zero.

**How it works:** `GET /api/split/groups/:id/balances`. Net per member = paid − share + payments made − payments received (group currency). Simplified: repeatedly match the largest creditor with the largest debtor. Pairwise: for each expense, each sharer owes each payer in proportion to what they paid, netted per pair, rounded half-even to 2 places.

**Related features:** F-SPLIT-012, F-SPLIT-013, F-SPLIT-014.

**Sources:** `apps/web/src/pages/split/GroupPage.tsx:340`, `apps/web/src/pages/split/GroupPage.tsx:349`, `apps/web/src/pages/split/GroupPage.tsx:356`, `packages/api/src/services/split/balances.ts:16`, `packages/api/src/services/split/balances.ts:30`, `packages/api/src/services/split/balances.ts:63`, `packages/api/src/services/split/ledger.service.ts:20`

### Settle up (record a payment) <!-- F-SPLIT-012 -->
**What it does:** The **Settle up** dialog records money paid between two members: **Paid by**, **Paid to**, **Amount (<currency>)**, **Method** (Cash, UPI, Other) and **Date**. Opened from a balance row it is pre-filled with that row.

**Why it exists:** Inferred from behavior: records repayments made outside the app so balances update.

**Where to find it:** Group page → **Settle up**, or **Settle** on a balance row.

**Who can use it:** Active group members (any member can record any pair).

**Steps**
1. Check **Paid by**, **Paid to**, **Amount**, **Method**, **Date**.
2. Click **Record payment** ("Payment recorded").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Paid by**, **Paid to** | Selects | The two members | — |
| **Method** | Select | S-SPLIT-013 | — |
| **Record payment** / **Cancel** | Buttons | Save or close | Record disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Paid by / Paid to | Selects | Yes | Different active members | You / first other | "Pick two different people" |
| Amount | Number | Yes | > 0, at most 2 decimals | Row amount | "Enter an amount above 0 with at most 2 decimals" |
| Date | Date | Yes | Not in the future | Today | "Invalid date" |

**Settings and toggles here:** S-SPLIT-013 **Payment method**.

**Results:** Balances update; activity records the payment.

**Errors and troubleshooting:** "Could not record the payment" + reason; "Payer and receiver must differ".

**Limitations:** Payments are always in the group currency from this dialog. A payment can be deleted from the expense list but not edited.

**How it works:** `POST /api/split/settlements` (amount 2 dp, method CASH/UPI/OTHER, date). `DELETE /api/split/settlements/:id` soft-deletes.

**Related features:** F-SPLIT-011, F-SPLIT-013.

**Sources:** `apps/web/src/pages/split/SettleUpDialog.tsx:62`, `apps/web/src/pages/split/SettleUpDialog.tsx:96`, `apps/web/src/pages/split/SettleUpDialog.tsx:109`, `packages/api/src/controllers/split.controller.ts:58`, `packages/api/src/services/split/settlements.service.ts:34`

### Pay via UPI <!-- F-SPLIT-013 -->
**What it does:** **Pay** on a balance row opens **Pay <name>**: the amount, the payee's name and UPI ID, **Open UPI app** (a `upi://pay` link), **Copy pay link** and a QR code ("Scan with any UPI app"). A second after the QR shows (or when you tap **Open UPI app**) it asks "Did the payment go through?" — **Yes, record it** records a UPI payment for today; **Not yet** closes.

**Why it exists:** Code comment: "a co-member's UPI ID is revealed only to someone who actually owes them."

**Where to find it:** Group page → **Balances** → **Pay** (INR groups only).

**Who can use it:** A member who owes the payee in that group.

**Steps**
1. Click **Pay**. Pay in your UPI app (button, copy link or scan).
2. Click **Yes, record it** ("Payment recorded").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Open UPI app** | Link button | Opens the UPI intent | — |
| **Copy pay link** | Button | Copies the link | — |
| **Yes, record it** / **Not yet** | Buttons | Record or close | Record disabled while saving |

**Fields and rules:** None (amount is what you owe; the API allows a smaller amount but not more).

**Settings and toggles here:** The payee's S-SPLIT-007 **UPI ID**.

**Results:** A UPI payment is recorded and balances update.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "<name> hasn't shared a UPI ID in this group yet" + "Ask them to add a UPI ID in Split settings" | Payee has no UPI ID (or, for a linked account, hasn't added or paid anything in the group yet) | Ask them |
| "UPI works only for INR groups" | Foreign-currency group | Settle up manually |
| "you don't owe <name> anything here" | Nothing owed | — |

**Limitations:** UPI only for INR groups. The payee's UPI ID comes from their own Split settings (if they have an account and have taken part in the group) or from the saved person's UPI ID, which the page cannot set.

**How it works:** `GET /api/split/groups/:id/upi-link?to=&amount=` builds `upi://pay?pa=…&pn=…&am=…&cu=INR&tn=<group> settle-up` (note max 40 characters); not cached in the browser.

**Related features:** F-SPLIT-011, F-SPLIT-017.

**Sources:** `apps/web/src/pages/split/PayNowDialog.tsx:30`, `apps/web/src/pages/split/PayNowDialog.tsx:48`, `apps/web/src/pages/split/PayNowDialog.tsx:86`, `apps/web/src/pages/split/PayNowDialog.tsx:99`, `packages/api/src/services/split/settings.service.ts:63`

### Remind and share a pay link <!-- F-SPLIT-014 -->
**What it does:** On a balance row where someone owes you: **Remind** emails them "Reminder: you owe <you> <amount>"; **Share pay link** opens your phone's share sheet (or copies the link) with "<name>, pay ₹… for <group>: <upi link>" that pays your own UPI ID.

**Why it exists:** Code comment: "requestLink only reveals the caller's own UPI ID."

**Where to find it:** Group page → **Balances** (rows where you are paid).

**Who can use it:** The member who is owed.

**Steps**
1. Click **Remind** ("Reminder sent") or **Share pay link**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Remind** | Button | Emails a reminder | While sending |
| **Share pay link** | Button | Shares/copies your UPI link | INR groups only; disabled while the link loads |
| **Open Split settings** | Link | Shown with a missing-UPI error | — |

**Fields and rules:** None.

**Settings and toggles here:** Your S-SPLIT-007 **UPI ID** (required for **Share pay link**).

**Results:** An email (Remind) or a shared message.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Already reminded today" | Already reminded this person in this group today | Wait |
| "Daily reminder limit reached - try again tomorrow" | 30 reminders in 24 hours | Wait |
| "<name> has no email on file" | No email for them | Add their email (not possible in the page for an existing person) |
| "Reminder saved but email couldn't be sent right now" | Mail failure | Try later |
| "add your UPI ID in Split settings first" | No UPI ID | **Open Split settings** |

**Limitations:** UPI links only for INR groups.

**How it works:** `POST /api/split/reminders` (once per day per person per group, 30/day per user); `GET /api/split/groups/:id/request-link?from=` uses only your own UPI ID.

**Related features:** F-SPLIT-011, F-SPLIT-017.

**Sources:** `apps/web/src/pages/split/GroupPage.tsx:237`, `apps/web/src/pages/split/GroupPage.tsx:286`, `packages/api/src/services/split/notify.service.ts:19`, `packages/api/src/services/split/notify.service.ts:29`, `packages/api/src/services/split/settings.service.ts:111`

### Group settings and members <!-- F-SPLIT-015 -->
**What it does:** The group's **Settings** tab: **Group name** with **Rename**, **Simplify debts (fewest payments to settle)**, "Currency: <ccy> (fixed once a group is created)", the member list (badge "On EveryPaisa" for linked accounts; **Invite** for saved people with an email who have no account; **Remove**, or for yourself, leave), **Add someone…** select, **+ New person**, and **Archive group** / **Unarchive group**. 1:1 groups show only the member list.

**Why it exists:** Inferred from behavior: manage who shares the ledger and keep finished groups out of the way.

**Where to find it:** Group page → **Settings**.

**Who can use it:** Any active member.

**Steps**
1. Change the name and click **Rename** ("Saved").
2. Pick a person in **Add someone…** to add them.
3. Click **Remove** (or on yourself, **Remove** → **Leave**) and confirm.
4. Click **Invite** to email someone an invitation to join ("Invite sent").
5. Click **Archive group**; if balances are unsettled confirm "This group still has unsettled balances. Archive anyway?".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Rename** | Button | Saves the name | Name empty or unchanged; hidden on 1:1 |
| **Simplify debts (fewest payments to settle)** | Checkbox | S-SPLIT-003 | Hidden on 1:1 |
| **Invite** | Button | Emails an invite | Only for saved people with an email and no account |
| **Remove** / **Leave** | Button + confirm | Removes a member / you | Hidden on 1:1 |
| **Add someone…** | Select | Adds a saved person | Hidden on 1:1 |
| **+ New person** | Link | F-SPLIT-002, then adds them | Hidden on 1:1 |
| **Archive group** / **Unarchive group** | Button | S-SPLIT-004 | Hidden on 1:1; disabled until balances load |

**Fields and rules:** Group name 1–120 characters ("Group name is required").

**Settings and toggles here:** S-SPLIT-003 **Simplify debts**, S-SPLIT-004 **Archive group**.

**Results:** Membership and settings change; activity records it. Leaving removes the group from your lists.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Settle this member to zero first" | Member has a balance | Settle up first |
| "A group needs at least one active linked member" | Would leave no account-holder in the group | Keep one |
| "That person is already in the group" | Duplicate | — |
| "A 1:1 ledger always has exactly two people" | 1:1 group | — |
| "They're already on EveryPaisa" / "Already invited today" / "Daily invite limit reached - try again tomorrow" / "Add their email address first" | Invite limits | — |

**Limitations:** The group type can't be changed in the page. A removed member who took part in anything is kept as "left" so history still names them; they can be re-added.

**How it works:** `PATCH /api/split/groups/:id` (name, simplifyDebts, archived), `POST /api/split/groups/:id/members`, `DELETE /api/split/groups/:id/members/:memberId`, `POST /api/split/contacts/:id/invite` (one per person per 24 h, 20 per day).

**Related features:** F-SPLIT-002, F-SPLIT-011, F-SPLIT-019.

**Sources:** `apps/web/src/pages/split/GroupPage.tsx:170`, `apps/web/src/pages/split/GroupPage.tsx:174`, `apps/web/src/pages/split/GroupPage.tsx:188`, `apps/web/src/pages/split/GroupPage.tsx:206`, `apps/web/src/pages/split/GroupPage.tsx:223`, `packages/api/src/services/split/groups.service.ts:185`, `packages/api/src/services/split/groups.service.ts:210`, `packages/api/src/services/split/groups.service.ts:214`, `packages/api/src/services/split/linking.service.ts:22`, `packages/api/src/services/split/linking.service.ts:89`

### Friend balances and 1:1 expenses <!-- F-SPLIT-016 -->
**What it does:** A friend's page shows **Overall** (owes you / you owe, "≈" if converted), "Includes groups in other currencies, converted at the latest rate." when relevant, and **By group** (each group's balance; the 1:1 ledger shows as "Just you two"). **Add expense** opens a 1:1 ledger with that person (created on first use).

**Why it exists:** Inferred from behavior: track money between two people without making a group.

**Where to find it:** **Tools → Split Expenses →** a name under **Friends** (route `/split/friends/:key`).

**Who can use it:** R-FREE and above, R-MANAGER.

**Steps**
1. Click **Add expense** to add a 1:1 expense (F-SPLIT-005).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add expense** | Button | Opens/creates the 1:1 ledger and the expense dialog | Hidden for people who are not your saved contacts ("Add expenses with <name> inside your shared groups.") |
| Group rows | Links | Open the group | — |

**Fields and rules:** As F-SPLIT-005.

**Settings and toggles here:** S-SPLIT-008 **Home currency**.

**Results:** A 1:1 group (type "DIRECT") the first time.

**Errors and troubleshooting:** "No balances with this person." / "Could not open your 1:1 expenses".

**Limitations:** 1:1 ledgers always have exactly two people.

**How it works:** `POST /api/split/groups/direct` (finds or creates under a lock so two tabs can't create two); balances from `GET /api/split/friends`.

**Related features:** F-SPLIT-001, F-SPLIT-005.

**Sources:** `apps/web/src/pages/split/FriendPage.tsx:48`, `apps/web/src/pages/split/FriendPage.tsx:55`, `apps/web/src/pages/split/FriendPage.tsx:62`, `packages/api/src/services/split/groups.service.ts:231`

### Split settings <!-- F-SPLIT-017 -->
**What it does:** **Split settings** has three cards: **Payments** (**UPI ID**, "Friends see this when they pay you"), **Defaults** (**Home currency**, **Default portfolio**), **Emails** ("Email me about activity in my groups (at most hourly)", "Weekly balance summary (Mondays)"), and **Save**.

**Why it exists:** Inferred from behavior: personal preferences for paying, converting and notifications.

**Where to find it:** **Tools → Split Expenses → Settings** (route `/split/settings`).

**Who can use it:** R-FREE and above, R-MANAGER.

**Steps**
1. Change values and click **Save** ("Settings saved").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **UPI ID** | Text | S-SPLIT-007 | — |
| **Home currency** | Select | S-SPLIT-008 | — |
| **Default portfolio** | Select ("None") | S-SPLIT-009 | — |
| Email about activity | Checkbox | S-SPLIT-010 | — |
| Weekly balance summary | Checkbox | S-SPLIT-011 | — |
| **Save** | Button | Saves all | Invalid UPI ID; while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| UPI ID | Text | No | name@bank: 2–256 of letters, digits, `.`, `_`, `-`, then `@`, then 2–64 letters | Empty | "Enter a UPI ID like name@bank" / "Invalid UPI ID" |
| Default portfolio | Select | No | One of your portfolios | None | "Pick one of your own portfolios" |

**Settings and toggles here:** S-SPLIT-007 to S-SPLIT-011.

**Results:** Saved per user.

**Errors and troubleshooting:** "Couldn't load your settings." / "Couldn't save your settings".

**Limitations:** Home currency choices are the same 10 currencies.

**How it works:** `GET/PUT /api/split/settings`; defaults when never saved: UPI none, INR, no portfolio, activity emails on, weekly off.

**Related features:** F-SPLIT-010, F-SPLIT-013, F-SPLIT-014, F-SPLIT-018.

**Sources:** `apps/web/src/pages/split/SplitSettingsPage.tsx:65`, `apps/web/src/pages/split/SplitSettingsPage.tsx:85`, `apps/web/src/pages/split/SplitSettingsPage.tsx:89`, `apps/web/src/pages/split/SplitSettingsPage.tsx:92`, `packages/api/src/controllers/split.controller.ts:118`, `packages/api/src/services/split/settings.service.ts:22`, `packages/api/prisma/schema.prisma:5441`

### Activity and weekly email digests <!-- F-SPLIT-018 -->
**What it does:** Sends two kinds of email: an activity digest "<N> updates in your shared expenses" about changes other people made in your groups, and a Monday "Your weekly balances" summary (top 10 people, plus "In total you are owed / you owe").

**Why it exists:** Inferred from behavior: keeps members informed without opening the app.

**Where to find it:** Your email inbox; switch on/off in **Split settings → Emails**.

**Who can use it:** Members with an account (R-FREE and above).

**Steps:** Not applicable — automatic.

**Controls:** None here (see F-SPLIT-017).

**Fields and rules:** None.

**Settings and toggles here:** S-SPLIT-010 **Email about activity** (on by default), S-SPLIT-011 **Weekly balance summary** (off by default).

**Results:** Emails.

**Errors and troubleshooting:** None user-facing; failures are logged.

**Limitations:** Activity digests cover at most the last 7 days and never include your own actions. The weekly summary skips you when all balances are zero or the account is inactive/scheduled for deletion.

**How it works:** Cron in Asia/Kolkata: activity digest every hour at :05; weekly digest Mondays 09:00. Both run as system and loop per user.

**Related features:** F-SPLIT-017.

**Sources:** `packages/api/src/jobs/splitDigestJobs.ts:33`, `packages/api/src/jobs/splitDigestJobs.ts:34`, `packages/api/src/services/split/notify.service.ts:116`, `packages/api/src/services/split/notify.service.ts:168`

### Linking people who join <!-- F-SPLIT-019 -->
**What it does:** When someone signs up or signs in with an email that you saved on a person, that person is linked to their account: they see your shared groups and the activity says "<name> joined EveryPaisa".

**Why it exists:** Inferred from behavior: people you split with can take part themselves once they have an account.

**Where to find it:** Automatic; the member shows "On EveryPaisa" in group settings.

**Who can use it:** Automatic.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Matching uses the email saved on the person (normalised to lowercase).

**Settings and toggles here:** None.

**Results:** The member row is attached to the account.

**Errors and troubleshooting:** None user-facing.

**Limitations:** If the account is already a member of that group, the placeholder is left unlinked.

**How it works:** Called from the auth service after registration/sign-in (`linkContactsForUser`), run as system, matched by email hash.

**Related features:** F-SPLIT-002, F-SPLIT-015, D-SPLIT-003.

**Sources:** `packages/api/src/services/split/linking.service.ts:44`, `packages/api/src/services/auth/auth.service.ts:330`

**What this area doesn't do**
- No plan limits: Split Expenses is free for everyone.
- You can't edit or delete saved people, store their UPI ID, edit a payment, rename/delete labels or change a group's type or currency in the page.
- UPI pay and request links work only for INR groups; nothing is debited automatically.
- Payments are not added to Cash Activity; only your expense shares can be.
- It does not read SMS, email or receipts to create expenses.
