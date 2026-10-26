<!-- END MODULES -->

## Roles and profiles

### Signed-out visitor <!-- R-VISITOR -->
Cannot open any page in these modules; every route is inside the signed-in app and sends the visitor to sign in. The only unauthenticated endpoint here is the browser extension's pairing exchange, which needs a valid 5-minute pairing code.

### Free user <!-- R-FREE -->
Full use of Insurance, PPF & EPF, Forex, Income and Cash Activity. Goals is locked (Plus) and Accounting is locked (Pro/Advisor): both pages show blurred behind an upgrade card, and their API calls are refused. On Goals the **New goal** button still opens the form, but saving fails.

### Plus subscriber <!-- R-PLUS -->
Everything a Free user has, plus Goals. Accounting stays locked.

### Family subscriber <!-- R-FAMILY -->
Same as Plus in these modules.

### Pro/Advisor subscriber <!-- R-PRO -->
Everything, including Accounting (chart of accounts, vouchers, ledger, statements, receipts) and **Export to Tally**.

### Administrator <!-- R-ADMIN -->
No admin-only powers in these modules; an administrator's access follows their own plan.

### Family owner <!-- R-FAMOWNER -->
Family view does not change these pages: they always show your own policies, provident-fund entries, forex records, goals, income, cash flows and books.

### Family contributor <!-- R-FAMCONTRIB -->
As Family owner: these pages show only your own data in family view.

### Family viewer <!-- R-FAMVIEWER -->
As Family owner: these pages show only your own data in family view.

### Managing a family member's account <!-- R-MANAGER -->
While managing someone's account, every page here shows and changes that person's data; plan locks (Goals, Accounting) follow the manager's plan. The insurance Gmail search lists the managed person's Gmail accounts (normally none). PF portal refresh, passbook upload and extension pairing act on the managed person's accounts.

### Professional acting for a client <!-- R-PROF -->
These pages show the professional's own data. A client's books, accounting and receipts are reached only through the CA workspace, within the grant (D-ACCT-004).

### AI chatbot connection <!-- R-AICONN -->
No access to these pages. With the matching areas approved, a connected chatbot can read (never change) insurance policies, retirement accounts (EPF/PPF/NPS), foreign-currency data, goals, income and the tax summary through its own tools.

### Succession nominee <!-- R-NOMINEE -->
No access to these modules.

## Glossary
| Term (as in UI) | Meaning in this product |
|---|---|
<!-- BEGIN GLOSSARY -->
| Sum assured / Cover | The amount a policy pays on the insured event; shown as **Cover** on the policy card and as **Sum assured** for life policies. |
| Next premium due | The date of the earliest unpaid premium; when entered on a new policy, earlier premiums count as already paid ("untracked"). |
| Grace period | Days after a premium's due date during which it can still be paid and cover continues: by default 30 days for life and health policies paid in instalments, 15 if monthly, none otherwise. |
| Coming up | The Insurance panel of premiums due within 30 days or overdue. |
| May have lapsed / Cover has ended | A premium past its grace period (or past its due date with no grace) with no payment recorded. |
| Untracked premium | A premium due before the date you started tracking the policy; treated as paid. |
| Critical illness cover | A lump sum paid on diagnosis of a listed illness, recorded as Yes / No / Not recorded on a policy. |
| Surrender value | What the insurer would pay if you end a whole life, endowment or ULIP policy early; entered from the insurer's quote. |
| TPA | Third-party administrator that settles health claims for an insurer. |
| Ombudsman | The Insurance Ombudsman, to whom an unresolved complaint can be taken (claims up to ₹50 lakh). |
| Family insurance sheet | The printable one-page summary of active policies for your family. |
| Coverage check | The page that compares your life, health, vehicle and home cover with what your figures suggest you need. |
| Auto-fetch account | An EPF UAN or PPF bank account linked so its passbook can be fetched from the portal. |
| UAN | Universal Account Number, the 12-digit EPF member number. |
| Passbook | The EPF/PPF statement of contributions, interest and withdrawals. |
| LRS | Liberalised Remittance Scheme: up to USD 250,000 per person per financial year sent abroad. |
| TCS | Tax collected at source on remittances; 20% above ₹7 lakh a year in this app's guidance. |
| FX pair | A currency-pair position such as USDINR or EURUSD, treated as speculative business income. |
| CAGR (goal) | The yearly return needed from today for a goal's current value to reach its target by the target date. |
| Off-track | A goal whose needed yearly return is higher than the expected return you entered. |
| Total active monthly income | The sum of income entries marked **Currently active**. |
| Cash flow | A money-in (**Inflow**) or money-out (**Outflow**) entry created from approved bank alerts, rent and split settlements. |
| Scheduled cashflow | The 12-month forecast of loan EMIs, rent due, premiums and deposit maturities. |
| Voucher | A double-entry record; types JOURNAL, PAYMENT, RECEIPT, CONTRA, PURCHASE, SALES. "auto" marks one generated from your activity. |
| Chart of accounts | The tree of ledger accounts vouchers post to. |
| Difference in Opening Balances | The balancing line added to the balance sheet when opening balances don't net to zero. |
<!-- END GLOSSARY -->
