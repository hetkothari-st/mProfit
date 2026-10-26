<!-- END MODULES -->

## Roles and profiles

Role definitions are global; this fragment repeats only what differs in these modules. Full definitions are in the roles chapter of the merged manual.

### Signed-out visitor <!-- R-VISITOR -->
Can open a professional invitation link (`/professional-invitations/:token`) and read who invited them before signing in. Everything else here needs sign-in.

### Free user <!-- R-FREE -->
Split Expenses in full. Advisor shows a locked card. Can act for clients who invited them (professional workspace, with two-factor), but catalogue report downloads for a client are refused on this plan (see F-CA-015).

### Plus subscriber <!-- R-PLUS -->
Adds the Investment Advisor. Client report downloads from the catalogue work; accounting report downloads do not.

### Family subscriber <!-- R-FAMILY -->
Same as Plus in these modules.

### Pro/Advisor subscriber <!-- R-PRO -->
Adds **Invite a client** (a practice of your own) and accounting report downloads for clients.

### Administrator <!-- R-ADMIN -->
No admin-only powers in these modules; access follows the admin's plan.

### Family owner <!-- R-FAMOWNER -->
Family view does not change these modules: advice, client books and split groups are always your own.

### Family contributor <!-- R-FAMCONTRIB -->
Same as base plan.

### Family viewer <!-- R-FAMVIEWER -->
Same as base plan.

### Managing a family member's account <!-- R-MANAGER -->
Advisor and Split Expenses work on the managed person's data (Advisor under the manager's plan; split groups use the managed person's name). The professional workspace and professional invitations are refused ("Switch back to your own account to do this.").

### Professional acting for a client <!-- R-PROF -->
Uses **Client books**: read within the client's scope; change only what the client allowed; never delete a client transaction; two-factor sign-in required every session.

### AI chatbot connection <!-- R-AICONN -->
Can read your split balances through the `list_split_balances` tool when the Split expenses area is approved. No access to advice or client books.

### Succession nominee <!-- R-NOMINEE -->
No access to these modules.

## Glossary
| Term | Meaning |
|---|---|
<!-- BEGIN GLOSSARY -->
| Risk profile | Your category (Conservative, Balanced, Growth, Aggressive), score 0–100 and tax slab, set by the 7-question risk assessment on the Advisor page. |
| Model portfolio | A set of target weights per asset bucket. Four are created for you (one per risk category) on your first assessment. |
| Bucket | One of seven advisor asset groups: Equity — Domestic, Equity — International, Debt, Gold, Real assets, Cash equivalent, Other / alternatives. |
| Drift | Current weight minus target weight of a bucket, in percentage points (pp). 5 pp or more is treated as material. |
| Recommendation | One suggested move from the Advisor engine, with reasoning, figures and a status: Open, Accepted, Snoozed, Done or Dismissed. |
| Override list | Your approved products for a bucket; when non-empty, the Advisor names these instead of the house methodology's pick. |
| House methodology | The firm's signed fund-ranking method, scored nightly, used to name funds in recommendations when enabled. |
| Client books | The professional workspace (`/ca`) where an accountant or adviser works in the books of people who gave them access. |
| Account Access | The account holder's page listing professionals who can see their books, where access is granted, narrowed, extended or withdrawn. |
| Engagement | A professional's active relationship with one client; **Close engagement** ends it from the professional's side. |
| View only / Make some changes / Keep the books | What a professional may change in a client's books: nothing, some of the four areas (books, transactions, imports, fair market values), or all four. |
| Voucher | A double-entry accounting record (Journal, Payment, Receipt, Contra, Purchase, Sales) in a client's books. |
| FMV (31 Jan 2018) | Fair market value on 31 January 2018, used to grandfather long-term equity gains under Section 55(2)(ac). |
| Split group | A shared ledger of expenses and payments among people, in one currency (types Trip, Home, Couple, Other; 1:1 ledgers with a friend show as "Just you two"). |
| Simplify debts | Group setting that suggests the fewest payments needed to settle everyone, instead of person-to-person debts. |
| Settle up | Recording a payment from one member to another (Cash, UPI or Other) that reduces what they owe. |
| Add my share to Cash Activity | Switch on a split expense that adds your share as an outflow in your Cash Activity and keeps it updated. |
<!-- END GLOSSARY -->
